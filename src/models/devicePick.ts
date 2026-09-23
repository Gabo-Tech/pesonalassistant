import type { Locale } from '../i18n/wake';

export type DevicePick = {
  sttId: string;
  llmId: string;
  /** Shown as optional on mid-range phones. Not downloaded unless the user chooses it. */
  heavierLlmId: string | null;
};

const GB = 1_000_000_000;

/** Pick on-device models from RAM. Spanish always uses a multilingual Whisper file. */
export function recommendForRam(bytes: number | null, locale: Locale): DevicePick {
  const tiny = locale === 'es' ? 'whisper-tiny' : 'whisper-tiny-en';
  const base = locale === 'es' ? 'whisper-base' : 'whisper-base-en';
  if (bytes == null || bytes < 4 * GB) {
    return { sttId: tiny, llmId: 'qwen2.5-0.5b-q4', heavierLlmId: null };
  }
  if (bytes < 6 * GB) {
    return { sttId: tiny, llmId: 'qwen2.5-0.5b-q4', heavierLlmId: 'qwen2.5-1.5b-q4' };
  }
  return { sttId: base, llmId: 'qwen2.5-1.5b-q4', heavierLlmId: null };
}
