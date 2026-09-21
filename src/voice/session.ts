import { ask } from '../llm/engine';
import { routeAction } from '../llm/router';
import {
  applyVoiceDecision,
  cancelPending,
  getGateState,
  subscribeGate,
} from '../share/confirmGate';
import { addTurn } from '../db/turns';
import { peekSettings } from '../settings/store';
import { speak, stopSpeaking } from './tts';
import { transcribe } from './stt';
import { EnergyVad } from './vad';
import { detectWake } from './wake';

/**
 * The voice state machine.
 *
 *   idle ──wake word──► listening ──utterance──► thinking ──action──► speaking ──► idle
 *                                                    │
 *                                                    └─ needs approval ─► confirming
 *
 * While `thinking` or `speaking` the microphone is ignored, otherwise the assistant
 * would hear its own voice and talk to itself. While `confirming`, transcripts bypass
 * the model entirely and only match send/cancel - that is what makes a spoken "send"
 * as trustworthy as the button.
 */

export type SessionState =
  | 'off'
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'confirming';

export type SessionSnapshot = {
  state: SessionState;
  /** Last thing we heard, for the live transcript. */
  heard: string;
  /** Last thing the assistant said. */
  said: string;
  error: string | null;
  /** True while the user is actively talking, for the orb animation. */
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
    // A confirmation that expires, or is resolved from the UI, must move the machine
    // back so the microphone is not stuck waiting for a "yes" that will never come.
    subscribeGate((gate) => {
      const state = this.snapshot.state;
      if (state === 'off') return;

      if (gate.pending && state !== 'confirming') {
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

  /** States where microphone input must be discarded. */
  private isDeaf(): boolean {
    return (
      this.busy ||
      this.snapshot.state === 'off' ||
      this.snapshot.state === 'thinking' ||
      this.snapshot.state === 'speaking'
    );
  }

  /* ------------------------- external controls ------------------------- */

  start(): void {
    if (this.snapshot.state === 'off') {
      this.vad.reset();
      this.update({ state: 'idle', error: null });
    }
  }

  stop(): void {
    this.vad.reset();
    stopSpeaking();
    this.update({ state: 'off', hearingSpeech: false });
  }

  /** Push-to-talk: skip the wake word and capture the next utterance as a command. */
  beginPushToTalk(): void {
    stopSpeaking();
    this.vad.reset();
    this.update({ state: 'listening', error: null, heard: '' });
  }

  /** Feed a microphone buffer. Called from the audio provider. */
  pushAudio(samples: Float32Array, sampleRate: number): void {
    if (this.isDeaf()) return;
    this.vad.push(samples, sampleRate);
  }

  configureVad(threshold: number): void {
    this.vad.configure({ threshold });
  }

  /* ------------------------- the loop ------------------------- */

  private async handleUtterance(samples: Float32Array): Promise<void> {
    if (this.isDeaf()) return;

    const state = this.snapshot.state;
    this.busy = true;

    try {
      const transcript = await transcribe(samples);
      if (!transcript) {
        this.busy = false;
        return;
      }

      if (state === 'confirming') {
        await this.handleConfirmSpeech(transcript);
        return;
      }

      if (state === 'listening') {
        this.update({ heard: transcript });
        await this.runCommand(transcript);
        return;
      }

      // state === 'idle': only a wake word gets us talking.
      const settings = peekSettings();
      const { matched, remainder } = detectWake(transcript, settings.wakeWord);
      if (!matched) return;

      if (remainder.trim()) {
        // "computer, remind me to call mum" - one breath, no extra prompt.
        this.update({ heard: remainder });
        await this.runCommand(remainder);
      } else {
        this.update({ state: 'listening', heard: '' });
        this.say('Yes?');
      }
    } catch (error) {
      this.update({
        state: 'idle',
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.busy = false;
    }
  }

  private async handleConfirmSpeech(transcript: string): Promise<void> {
    this.update({ heard: transcript });

    if (!peekSettings().voiceConfirm) {
      this.busy = false;
      return;
    }

    const outcome = await applyVoiceDecision(transcript);
    this.busy = false;

    if (outcome) {
      this.say(outcome);
    }
    // No match: stay in confirming and wait for a clearer answer or the timeout.
  }

  private async runCommand(text: string): Promise<void> {
    this.update({ state: 'thinking' });
    await addTurn('user', text);

    const reply = await ask(text);
    const routed = reply.action
      ? await routeAction(reply.action, reply.say)
      : { message: reply.say, awaitingConfirm: false };

    await addTurn('assistant', routed.message);
    this.busy = false;

    if (routed.awaitingConfirm) {
      // The gate subscription already moved us to `confirming`; just speak the ask.
      this.update({ said: routed.message });
      speak(routed.message);
      return;
    }

    this.say(routed.message);
  }

  /** Speaks a reply and returns to idle when done. */
  private say(message: string): void {
    this.update({ said: message, state: 'speaking' });

    if (!peekSettings().speakReplies) {
      this.update({ state: getGateState().pending ? 'confirming' : 'idle' });
      return;
    }

    speak(message, () => {
      // Give the speaker a beat to stop resonating before we listen again.
      setTimeout(() => {
        this.update({ state: getGateState().pending ? 'confirming' : 'idle' });
      }, 250);
    });
  }

  /** Cancel from the UI. */
  cancelConfirmation(): void {
    cancelPending();
    this.say('Cancelled.');
  }
}

export const voiceSession = new VoiceSession();
