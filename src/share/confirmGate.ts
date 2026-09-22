/**
 * The single choke point for anything with real-world side effects.
 *
 * The language model can only ever *propose* an action; it calls into this gate and
 * stops. The action runs when the user taps Send or says a confirm phrase. That keeps
 * "the model hallucinated a tweet" from ever becoming "the model published a tweet".
 */

export type PendingKind = 'share' | 'calendar' | 'reminder' | 'alarm';

export type Pending = {
  id: string;
  kind: PendingKind;
  /** One-line headline for the card, e.g. "Send WhatsApp to +33...". */
  summary: string;
  /** The exact payload the user is approving (message body, event details). */
  detail: string;
  /** What the assistant says out loud while asking. */
  speech: string;
  confirmLabel: string;
  createdAt: number;
  expiresAt: number;
  execute: () => Promise<string>;
};

export type GateState = {
  pending: Pending | null;
  /** Result of the last committed or cancelled action, for the UI to show. */
  lastOutcome: string | null;
};

type Listener = (state: GateState) => void;

const listeners = new Set<Listener>();
let state: GateState = { pending: null, lastOutcome: null };
let expiryTimer: ReturnType<typeof setTimeout> | null = null;
/** Remaining ms when expiry is paused (STT in flight). */
let remainingMs = 0;
let paused = false;

function publish(next: Partial<GateState>): void {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn(state));
}

export function subscribeGate(fn: Listener): () => void {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

export function getGateState(): GateState {
  return state;
}

function clearTimer(): void {
  if (expiryTimer) {
    clearTimeout(expiryTimer);
    expiryTimer = null;
  }
}

function armTimer(pending: Pending, delayMs: number): void {
  clearTimer();
  paused = false;
  remainingMs = delayMs;
  pending.expiresAt = Date.now() + delayMs;
  expiryTimer = setTimeout(() => {
    if (state.pending?.id === pending.id) {
      publish({ pending: null, lastOutcome: 'Timed out - nothing was sent.' });
    }
  }, delayMs);
}

/**
 * Queues an action for approval, replacing any previous one so there is never
 * ambiguity about what "yes" refers to.
 */
export function requestConfirm(
  input: Omit<Pending, 'id' | 'createdAt' | 'expiresAt'>,
  timeoutMs = 20_000,
): Pending {
  clearTimer();
  paused = false;

  const createdAt = Date.now();
  const pending: Pending = {
    ...input,
    id: `${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt,
    expiresAt: createdAt + timeoutMs,
  };

  publish({ pending, lastOutcome: null });
  armTimer(pending, timeoutMs);
  return pending;
}

/** Freeze the confirm timeout while Whisper is still chewing on "send". */
export function pauseExpiry(): void {
  if (!state.pending || paused) return;
  remainingMs = Math.max(0, state.pending.expiresAt - Date.now());
  clearTimer();
  paused = true;
}

/** Continue the leftover timeout after STT finishes (or a non-match). */
export function resumeExpiry(): void {
  const pending = state.pending;
  if (!pending || !paused) return;
  paused = false;
  if (remainingMs <= 0) {
    publish({ pending: null, lastOutcome: 'Timed out - nothing was sent.' });
    return;
  }
  armTimer(pending, remainingMs);
}

/** Runs the pending action. Returns the human-readable result, or null if nothing was pending. */
export async function commitPending(): Promise<string | null> {
  const pending = state.pending;
  if (!pending) return null;

  clearTimer();
  paused = false;
  publish({ pending: null });

  try {
    const outcome = await pending.execute();
    publish({ lastOutcome: outcome });
    return outcome;
  } catch (error) {
    const message = `Failed: ${error instanceof Error ? error.message : String(error)}`;
    publish({ lastOutcome: message });
    return message;
  }
}

export function cancelPending(reason = 'Cancelled - nothing was sent.'): void {
  if (!state.pending) return;
  clearTimer();
  paused = false;
  publish({ pending: null, lastOutcome: reason });
}

export function clearOutcome(): void {
  if (state.lastOutcome !== null) publish({ lastOutcome: null });
}

/* ------------------------------------------------------------------ *
 * Spoken confirmation
 * ------------------------------------------------------------------ */

const CANCEL_PHRASES = [
  'cancel',
  'cancelar',
  'no',
  'nope',
  'stop',
  'para',
  'dont send',
  'do not send',
  'no enviar',
  'no envies',
  'dont',
  'nevermind',
  'never mind',
  'forget it',
  'olvidalo',
  'abort',
  'discard',
];

const CONFIRM_PHRASES = [
  'send',
  'send it',
  'sent it',
  'enviar',
  'envialo',
  'envia',
  'yes',
  'si',
  'yes send',
  'yes send it',
  'yeah',
  'yep',
  'yup',
  'confirm',
  'confirmar',
  'confirmed',
  'do it',
  'go ahead',
  'adelante',
  'post',
  'post it',
  'publish',
  'publicar',
  'okay send',
  'ok send',
  'sure',
];

/** Lowercase; drop apostrophes so "don't" stays one token, then strip other punctuation. */
export function normalizeDecisionText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\bdon t\b/g, 'dont')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsPhrase(text: string, words: string[], phrase: string): boolean {
  if (text === phrase || text.startsWith(`${phrase} `) || text.endsWith(` ${phrase}`)) return true;
  if (text.includes(` ${phrase} `)) return true;
  return phrase.split(' ').length === 1 && words.includes(phrase);
}

/**
 * Maps a spoken utterance to a gate decision.
 *
 * Deliberately strict: only short utterances count, so a dictated sentence that merely
 * contains the word "send" can never trigger a send. Cancel wins over confirm, which
 * makes "don't send" and "no, don't send that" safe.
 */
export function matchVoiceDecision(transcript: string): 'confirm' | 'cancel' | null {
  const text = normalizeDecisionText(transcript);
  if (!text) return null;

  const words = text.split(' ');
  if (words.length > 4) return null;

  if (CANCEL_PHRASES.some((phrase) => containsPhrase(text, words, phrase))) return 'cancel';
  if (CONFIRM_PHRASES.some((phrase) => containsPhrase(text, words, phrase))) return 'confirm';
  return null;
}

/** Applies a spoken decision. Returns what happened so the caller can speak it back. */
export async function applyVoiceDecision(transcript: string): Promise<string | null> {
  if (!state.pending) return null;

  const decision = matchVoiceDecision(transcript);
  if (decision === 'confirm') return commitPending();
  if (decision === 'cancel') {
    cancelPending();
    return 'Cancelled - nothing was sent.';
  }
  return null;
}
