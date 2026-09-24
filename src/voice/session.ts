import { ask, type AskHooks } from '../llm/engine';
import { routeAction } from '../llm/router';
import type { AssistantReply } from '../llm/tools';
import { formatHits, searchFollowUp, searchWeb } from '../search/web';
import {
  applyVoiceDecision,
  cancelPending,
  getGateState,
  pauseExpiry,
  resumeExpiry,
  subscribeGate,
} from '../share/confirmGate';
import { t } from '../i18n';
import { addTurn, clearTurns } from '../db/turns';
import { peekSettings } from '../settings/store';
import { speak, speakQueued, stopSpeaking } from './tts';
import { isSttReady, transcribe } from './stt';
import { EnergyVad } from './vad';
import { detectWake } from './wake';
import {
  CANT_HEAR_MS,
  CONVERSATION_IDLE_MS,
  afterBlankSpeech,
  afterCommandResume,
  pushToTalkState,
  resumeAfterSpeech,
  shouldIgnoreAsync,
  unsaidRemainder,
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
  private conversationTimer: ReturnType<typeof setTimeout> | null = null;
  private cantHearTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly vad = new EnergyVad({
    onSpeechStart: () => {
      if (this.isDeaf()) return;
      this.clearCantHear();
      this.update({ hearingSpeech: true, error: null });
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
      this.update({
        state: 'idle',
        error: isSttReady() ? null : t('stt.missing'),
      });
    }
  }

  stop(): void {
    this.generation += 1;
    this.busy = false;
    this.clearConversationIdle();
    this.clearCantHear();
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
    this.clearConversationIdle();
    const next = pushToTalkState(Boolean(getGateState().pending));
    const missing = !isSttReady();
    this.update({
      state: next,
      error: missing ? t('stt.missing') : null,
      heard: next === 'listening' ? '' : this.snapshot.heard,
    });
    if (next === 'listening' && !missing) {
      this.armConversationIdle();
      this.armCantHear();
    }
  }

  /** The capture is open, but no PCM has arrived. Stay in listening. */
  reportMicSilent(): void {
    if (this.snapshot.state !== 'listening') return;
    this.update({ error: t('stt.micSilent') });
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
    this.clearConversationIdle();

    const confirming = capturedState === 'confirming' || Boolean(getGateState().pending);
    if (confirming) pauseExpiry();

    try {
      const transcript = await transcribe(samples);
      if (shouldIgnoreAsync(gen, this.generation, this.snapshot.state)) return;
      if (!transcript) {
        const next = afterBlankSpeech(capturedState);
        this.update({ state: next, error: t('stt.missed') });
        if (next === 'listening') {
          this.armConversationIdle();
          this.armCantHear();
        }
        return;
      }

      this.update({ error: null });

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
        this.say(t('voice.yes'), 'listening', gen);
      }
    } catch (error) {
      stopSpeaking();
      if (shouldIgnoreAsync(gen, this.generation, this.snapshot.state)) return;
      const raw = error instanceof Error ? error.message : String(error);
      const missing = /not loaded/i.test(raw);
      this.update({
        state: 'idle',
        error: missing ? t('stt.missing') : raw,
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

    const spoken: string[] = [];
    let drained = true;
    let replyReady = false;
    let finished = false;
    let resume: SessionState | null = null;
    let finalMessage = '';

    const finishSpeech = (): void => {
      if (finished || !replyReady || !drained) return;
      if (shouldIgnoreAsync(gen, this.generation, this.snapshot.state)) return;
      finished = true;
      // Same tail as say(): keep the mic deaf briefly so the speaker is not transcribed.
      setTimeout(() => {
        if (shouldIgnoreAsync(gen, this.generation, this.snapshot.state)) return;
        if (getGateState().pending) resumeExpiry();
        const next = resumeAfterSpeech({
          sessionOff: this.snapshot.state === 'off',
          gatePending: Boolean(getGateState().pending),
          requested: resume,
        });
        this.update({ state: next, said: finalMessage });
        if (next === 'listening') {
          this.armConversationIdle();
          this.armCantHear();
        }
      }, 250);
    };

    const reply = await this.replyFor(text, gen, {
      onSentence: (sentence) => {
        if (shouldIgnoreAsync(gen, this.generation, this.snapshot.state)) return;
        if (!peekSettings().speakReplies) return;
        spoken.push(sentence);
        drained = false;
        this.update({ state: 'speaking', said: spoken.join(' ') });
        speakQueued(sentence, () => {
          drained = true;
          finishSpeech();
        });
      },
      onSwap: () => {
        if (shouldIgnoreAsync(gen, this.generation, this.snapshot.state)) return;
        const line = t('voice.oneMoment');
        this.update({ said: line });
        if (peekSettings().speakReplies) speak(line);
      },
    });
    if (!reply || shouldIgnoreAsync(gen, this.generation, this.snapshot.state)) return;

    const routed = reply.action
      ? await routeAction(reply.action, reply.say, text)
      : { message: reply.say, awaitingConfirm: false };

    if (shouldIgnoreAsync(gen, this.generation, this.snapshot.state)) return;

    await addTurn('assistant', routed.message);
    this.busy = false;
    if (routed.awaitingConfirm) pauseExpiry();

    if (spoken.length === 0) {
      this.say(routed.message, afterCommandResume(routed.awaitingConfirm), gen);
      return;
    }

    finalMessage = routed.message;
    resume = afterCommandResume(routed.awaitingConfirm);
    const rest = unsaidRemainder(routed.message, spoken);
    replyReady = true;
    if (rest && peekSettings().speakReplies) {
      drained = false;
      this.update({ state: 'speaking', said: routed.message });
      speakQueued(rest, () => {
        drained = true;
        finishSpeech();
      });
      return;
    }

    this.update({ said: routed.message, state: 'speaking' });
    finishSpeech();
  }

  /** One optional web lookup, then a single answer. A second search request is not fetched. */
  private async replyFor(
    text: string,
    gen: number,
    hooks?: AskHooks,
  ): Promise<AssistantReply | null> {
    const first = await ask(text, hooks);
    if (shouldIgnoreAsync(gen, this.generation, this.snapshot.state)) return null;
    if (first.action?.tool !== 'web_search') return first;

    const query = first.action.query?.trim() || first.action.text?.trim() || text;
    this.update({ state: 'thinking', error: t('search.looking') });
    try {
      const hits = await searchWeb(query);
      if (shouldIgnoreAsync(gen, this.generation, this.snapshot.state)) return null;
      this.update({ error: null });
      if (hits.length === 0) return { say: t('search.empty') };

      const second = await ask(searchFollowUp(query, hits), { escalate: false });
      if (shouldIgnoreAsync(gen, this.generation, this.snapshot.state)) return null;
      if (second.action?.tool === 'web_search') return { say: formatHits(hits) };
      return second;
    } catch {
      if (shouldIgnoreAsync(gen, this.generation, this.snapshot.state)) return null;
      this.update({ error: null });
      return { say: t('search.failed') };
    }
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
      if (getGateState().pending) resumeExpiry();
      const next = resumeAfterSpeech({
        sessionOff: this.snapshot.state === 'off',
        gatePending: Boolean(getGateState().pending),
        requested: resume,
      });
      this.update({ state: next });
      if (next === 'listening') {
        this.armConversationIdle();
        this.armCantHear();
      }
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
    this.say(t('voice.cancelled'));
  }

  async clearChat(): Promise<void> {
    await clearTurns();
    this.update({ heard: '', said: '' });
  }

  private armConversationIdle(): void {
    this.clearConversationIdle();
    this.conversationTimer = setTimeout(() => {
      if (this.snapshot.state === 'listening') this.update({ state: 'idle' });
    }, CONVERSATION_IDLE_MS);
  }

  private clearConversationIdle(): void {
    if (!this.conversationTimer) return;
    clearTimeout(this.conversationTimer);
    this.conversationTimer = null;
  }

  private armCantHear(): void {
    this.clearCantHear();
    this.cantHearTimer = setTimeout(() => {
      if (this.snapshot.state === 'listening' && !this.snapshot.hearingSpeech) {
        this.update({ error: t('stt.cantHear') });
      }
    }, CANT_HEAR_MS);
  }

  private clearCantHear(): void {
    if (!this.cantHearTimer) return;
    clearTimeout(this.cantHearTimer);
    this.cantHearTimer = null;
  }
}

export const voiceSession = new VoiceSession();
