export type Locale = 'en' | 'es';

export const DEFAULT_WAKE: Record<Locale, string> = {
  en: 'computer',
  es: 'computadora',
};

export function localeTag(locale: Locale): string {
  return locale === 'es' ? 'es-ES' : 'en-US';
}

/** If the wake word is still a built-in default, swap it with the locale default. */
export function localeWakeWord(locale: Locale, current: string): string {
  const trimmed = current.trim();
  if (!trimmed || trimmed === DEFAULT_WAKE.en || trimmed === DEFAULT_WAKE.es) {
    return DEFAULT_WAKE[locale];
  }
  return trimmed;
}
