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

/** PTT must not yank the user out of a pending confirm. */
export function pushToTalkState(gatePending: boolean): SessionState {
  return gatePending ? 'confirming' : 'listening';
}

export function shouldIgnoreAsync(
  generation: number,
  current: number,
  state: SessionState,
): boolean {
  return generation !== current || state === 'off';
}
