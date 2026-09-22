import { en, type MessageKey } from './en';
import { es } from './es';
import { type Locale } from './wake';

export type { MessageKey, Locale };
export { DEFAULT_WAKE, localeTag, localeWakeWord } from './wake';

const DICTS: Record<Locale, Record<MessageKey, string>> = { en, es };

export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const dict = DICTS[locale] ?? en;
  let text = dict[key] ?? en[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}
