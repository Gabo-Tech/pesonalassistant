import { ask } from '../llm/engine';
import { routeAction } from '../llm/router';
import {
  applyVoiceDecision,
  cancelPending,
  getGateState,
  pauseExpiry,
  resumeExpiry,
  subscribeGate,
} from '../share/confirmGate';
import { addTurn } from '../db/turns';
import { peekSettings } from '../settings/store';
import { speak, stopSpeaking } from './tts';
import { transcribe } from './stt';
import { EnergyVad } from './vad';
import { detectWake } from './wake';
import {
  pushToTalkState,
  resumeAfterSpeech,
  shouldIgnoreAsync,
  type SessionState,
} from './sessionLogic';

export type { SessionState };

/**
 * The voice state machine.
 *
 *   idle ──wake word──► listening ──utterance──► thinking ──action──► speaking ──► idle
 *                                                    │
 *                                                    └─ needs approval ─► confirming
 *
 * While `thinking` or `speaking` the microphone is ignored, otherwise the assistant
 * would hear its own voice and talk to itself. While `confirming`, transcripts bypass
 * the model entirely and only match send/cancel.
 */

export type SessionSnapshot = {
  state: SessionState;
  heard: string;
  said: string;
  error: string | null;
  hearingSpeech: boolean;
};

type Listener = (snapshot: SessionSnapshot) => void;

class VoiceSession {
  private snapshot: SessionSnapshot = {
    state: 'off',
    heard: '',
    said: '',
    error: null,
    hearingSpeech: false,
  };

  private readonly listeners = new Set<Listener>();
  private busy = false;
  /** Bumped on stop / new command so in-flight STT, LLM, and TTS cannot revive the session. */
  private generation = 0;

  private readonly vad = new EnergyVad({
    onSpeechStart: () => {
      if (this.isDeaf()) return;
      this.update({ hearingSpeech: true });
    },
    onUtterance: (samples) => {
      this.update({ hearingSpeech: false });
      void this.handleUtterance(samples);
    },
  });

  constructor() {
    subscribeGate((gate) => {
      const state = this.snapshot.state;
      if (state === 'off') return;

      if (gate.pending && state !== 'confirming' && state !== 'speaking') {
        this.update({ state: 'confirming' });
      } else if (!gate.pending && state === 'confirming') {
        this.update({ state: 'idle' });
      }
    });
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot);
    return () => this.listeners.delete(fn);
  }

  getSnapshot(): SessionSnapshot {
    return this.snapshot;
  }

  private update(patch: Partial<SessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((fn) => fn(this.snapshot));
  }

  private isDeaf(): boolean {
    return (
      this.busy ||
      this.snapshot.state === 'off' ||
      this.snapshot.state === 'thinking' ||
      this.snapshot.state === 'speaking'
    );
  }

  start(): void {
    if (this.snapshot.state === 'off') {
      this.vad.reset();
      this.update({ state: 'idle', error: null });
    }
  }

  stop(): void {
    this.generation += 1;
    this.busy = false;
    this.vad.reset();
    stopSpeaking();
    this.update({ state: 'off', hearingSpeech: false });
  }

  /**
   * Push-to-talk: skip the wake word for the next utterance.
   * If a confirm card is up, stay in confirming so PTT cannot bypass the gate.
   */
  beginPushToTalk(): void {
    stopSpeaking();
    this.vad.reset();
    const next = pushToTalkState(Boolean(getGateState().pending));
    this.update({
      state: next,
      error: null,
      heard: next === 'listening' ? '' : this.snapshot.heard,
    });
  }

  pushAudio(samples: Float32Array, sampleRate: number): void {
    if (this.isDeaf()) return;
    this.vad.push(samples, sampleRate);
  }

  configureVad(threshold: number): void {
    this.vad.configure({ threshold });
  }

  private async handleUtterance(samples: Float32Array): Promise<void> {
    if (this.isDeaf()) return;

    const capturedState = this.snapshot.state;
    const gen = this.generation;
    this.busy = true;

    const confirming = capturedState === 'confirming' || Boolean(getGateState().pending);
    if (confirming) pauseExpiry();

    try {
      const transcript = await transcribe(samples);
      if (shouldIgnoreAsync(gen, this.generation, this.snapshot.state)) return;
      if (!transcript) return;

      if (confirming || this.snapshot.state === 'confirming') {
        await this.handleConfirmSpeech(transcript);
        return;
      }

      if (capturedState === 'listening') {
        this.update({ heard: transcript });
        await this.runCommand(transcript, gen);
        return;
      }

      const settings = peekSettings();
      const { matched, remainder } = detectWake(transcript, settings.wakeWord);
      if (!matched) return;

      if (remainder.trim()) {
        this.update({ heard: remainder });
        await this.runCommand(remainder, gen);
      } else {
        this.update({ state: 'listening', heard: '' });
        this.say('Yes?', 'listening', gen);
      }
    } catch (error) {
      if (shouldIgnoreAsync(gen, this.generation, this.snapshot.state)) return;
      this.update({
        state: 'idle',
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (gen === this.generation) this.busy = false;
      if (getGateState().pending) resumeExpiry();
    }
  }

  private async handleConfirmSpeech(transcript: string): Promise<void> {
    this.update({ heard: transcript });

    if (!peekSettings().voiceConfirm) return;

    const outcome = await applyVoiceDecision(transcript);
    if (outcome) this.say(outcome);
  }

  private async runCommand(text: string, gen: number): Promise<void> {
    this.update({ state: 'thinking' });
    await addTurn('user', text);
    if (shouldIgnoreAsync(gen, this.generation, this.snapshot.state)) return;

    const reply = await ask(text);
    if (shouldIgnoreAsync(gen, this.generation, this.snapshot.state)) return;

    const routed = reply.action
      ? await routeAction(reply.action, reply.say)
      : { message: reply.say, awaitingConfirm: false };

    if (shouldIgnoreAsync(gen, this.generation, this.snapshot.state)) return;

    await addTurn('assistant', routed.message);
    this.busy = false;
    this.say(routed.message, routed.awaitingConfirm ? 'confirming' : 'idle', gen);
  }

  async submitText(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;

    stopSpeaking();
    if (this.snapshot.state === 'off') this.start();

    const pending = Boolean(getGateState().pending) || this.snapshot.state === 'confirming';
    if (pending) {
      this.busy = true;
      pauseExpiry();
      try {
        await this.handleConfirmSpeech(trimmed);
      } finally {
        this.busy = false;
        if (getGateState().pending) resumeExpiry();
      }
      return;
    }

    this.generation += 1;
    const gen = this.generation;
    this.busy = true;
    try {
      this.update({ heard: trimmed });
      await this.runCommand(trimmed, gen);
    } finally {
      if (gen === this.generation) this.busy = false;
    }
  }

  /**
   * Speaks a reply. `resume` is where we go after TTS (wake-only uses `listening`).
   * A pending confirm always wins so we never drop the gate.
   */
  say(message: string, resume: SessionState | null = null, gen: number = this.generation): void {
    this.update({ said: message, state: 'speaking' });

    const finish = (): void => {
      if (shouldIgnoreAsync(gen, this.generation, this.snapshot.state)) return;
      const next = resumeAfterSpeech({
        sessionOff: this.snapshot.state === 'off',
        gatePending: Boolean(getGateState().pending),
        requested: resume,
      });
      this.update({ state: next });
    };

    if (!peekSettings().speakReplies) {
      finish();
      return;
    }

    speak(message, () => {
      setTimeout(finish, 250);
    });
  }

  cancelConfirmation(): void {
    cancelPending();
    this.say('Cancelled.');
  }
}

export const voiceSession = new VoiceSession();
