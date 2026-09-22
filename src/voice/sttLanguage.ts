import type { Locale } from '../i18n/wake';

/** English-only ggml files include `.en` in the filename (`ggml-tiny.en-q5_1.bin`). */
export function isEnglishOnlyModel(path: string | null | undefined): boolean {
  if (!path) return false;
  return /tiny\.en|base\.en|small\.en|\.en-q|\.en\.bin/i.test(path);
}

export function whisperLanguage(_locale: Locale, modelPath: string | null | undefined): string {
  if (isEnglishOnlyModel(modelPath)) return 'en';
  return 'auto';
}
