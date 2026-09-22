import { useCallback } from 'react';
import { peekSettings, useSettings } from '../settings/store';
import { translate, type MessageKey } from './locale';

export type { MessageKey };
export type { Locale } from './wake';
export { DEFAULT_WAKE, localeTag, localeWakeWord, translate } from './locale';

/** Hot-path helper for the voice loop and router (no React). */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(peekSettings().locale, key, vars);
}

export function useT(): (key: MessageKey, vars?: Record<string, string | number>) => string {
  const [settings] = useSettings();
  return useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) =>
      translate(settings.locale, key, vars),
    [settings.locale],
  );
}
