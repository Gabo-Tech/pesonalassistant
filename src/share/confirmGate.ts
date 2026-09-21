/**
 * The single choke point for anything with real-world side effects.
 *
 * The language model can only ever *propose* an action; it calls into this gate and
 * stops. The action runs when the user taps Send or says a confirm phrase. That keeps
 * "the model hallucinated a tweet" from ever becoming "the model published a tweet".
 */

export type PendingKind = 'share' | 'calendar' | 'reminder';

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

/**
 * Queues an action for approval, replacing any previous one so there is never
 * ambiguity about what "yes" refers to.
 */
export function requestConfirm(
  input: Omit<Pending, 'id' | 'createdAt' | 'expiresAt'>,
  timeoutMs = 20_000,
): Pending {
  clearTimer();

  const createdAt = Date.now();
  const pending: Pending = {
    ...input,
    id: `${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt,
    expiresAt: createdAt + timeoutMs,
  };

  publish({ pending, lastOutcome: null });

  expiryTimer = setTimeout(() => {
    if (state.pending?.id === pending.id) {
      publish({ pending: null, lastOutcome: 'Timed out - nothing was sent.' });
    }
  }, timeoutMs);

  return pending;
}

/** Runs the pending action. Returns the human-readable result, or null if nothing was pending. */
export async function commitPending(): Promise<string | null> {
  const pending = state.pending;
  if (!pending) return null;

  clearTimer();
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
  'no',
  'nope',
  'stop',
  'dont send',
  'do not send',
  'dont',
  'nevermind',
  'never mind',
  'forget it',
  'abort',
  'discard',
];

const CONFIRM_PHRASES = [
  'send',
  'send it',
  'sent it',
  'yes',
  'yes send',
  'yes send it',
  'yeah',
  'yep',
  'yup',
  'confirm',
  'confirmed',
  'do it',
  'go ahead',
  'post',
  'post it',
  'publish',
  'okay send',
  'ok send',
  'sure',
];

/** Lowercase, strip punctuation, collapse whitespace. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Maps a spoken utterance to a gate decision.
 *
 * Deliberately strict: only short utterances count, so a dictated sentence that merely
 * contains the word "send" can never trigger a send. Cancel wins over confirm, which
 * makes "no, don't send that" safe.
 */
export function matchVoiceDecision(transcript: string): 'confirm' | 'cancel' | null {
  const text = normalize(transcript);
  if (!text) return null;

  const words = text.split(' ');
  if (words.length > 4) return null;

  const hasPhrase = (phrases: string[]): boolean =>
    phrases.some((phrase) => text === phrase || words.includes(phrase) || text.startsWith(`${phrase} `));

  if (hasPhrase(CANCEL_PHRASES)) return 'cancel';
  if (hasPhrase(CONFIRM_PHRASES)) return 'confirm';
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
