/**
 * Pure next-state helpers so the Alexa loop can be unit-tested without
 * llama.rn / whisper.rn / TTS.
 */

export type SessionState =
  | 'off'
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'confirming';

/** After a spoken reply, stay in conversation mode until this silence window. */
export const CONVERSATION_IDLE_MS = 45_000;

/** Listening with no VAD hit — surface "I can't hear you" instead of a silent orb. */
export const CANT_HEAR_MS = 2_500;

export function resumeAfterSpeech(opts: {
  sessionOff: boolean;
  gatePending: boolean;
  requested: SessionState | null;
}): SessionState {
  if (opts.sessionOff) return 'off';
  if (opts.gatePending) return 'confirming';
  if (opts.requested) return opts.requested;
  return 'idle';
}

/** Follow-ups after a command skip the wake word until the conversation idle timer. */
export function afterCommandResume(awaitingConfirm: boolean): SessionState {
  return awaitingConfirm ? 'confirming' : 'listening';
}

/** PTT must not yank the user out of a pending confirm. */
export function pushToTalkState(gatePending: boolean): SessionState {
  return gatePending ? 'confirming' : 'listening';
}

/** Blank Whisper output must not leave the user stuck with no status. */
export function afterBlankSpeech(state: SessionState): SessionState {
  if (state === 'confirming') return 'confirming';
  if (state === 'listening') return 'listening';
  return state === 'off' ? 'off' : 'idle';
}

export function shouldIgnoreAsync(
  generation: number,
  current: number,
  state: SessionState,
): boolean {
  return generation !== current || state === 'off';
}
