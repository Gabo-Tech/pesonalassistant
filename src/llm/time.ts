/**
 * Natural-language time parsing, done locally.
 *
 * A 1.5B model is unreliable at date arithmetic ("what is next Tuesday's date?"),
 * so the model only has to echo the user's own time words and this parser turns them
 * into a timestamp. Deterministic code is both more accurate and easier to debug.
 */

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

const UNIT_MS: Record<string, number> = {
  minute: 60_000,
  minutes: 60_000,
  min: 60_000,
  mins: 60_000,
  hour: 3_600_000,
  hours: 3_600_000,
  hr: 3_600_000,
  hrs: 3_600_000,
  day: 86_400_000,
  days: 86_400_000,
  week: 604_800_000,
  weeks: 604_800_000,
};

export type ParsedWhen = { at: number; hadExplicitTime: boolean };

/** Extracts a clock time like "9", "9am", "9:30 pm", "18:00" from the text. */
function extractTimeOfDay(text: string): { hours: number; minutes: number } | null {
  const match = text.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\b/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3]?.replace(/\./g, '').toLowerCase();

  if (hours > 23 || minutes > 59) return null;

  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;

  // "at 8" with no am/pm and no 24h context: assume the next sensible 8 o'clock.
  if (!meridiem && hours <= 7) hours += 12;

  return { hours, minutes };
}

function atTime(base: Date, time: { hours: number; minutes: number } | null): Date {
  const date = new Date(base);
  if (time) {
    date.setHours(time.hours, time.minutes, 0, 0);
  } else {
    date.setHours(9, 0, 0, 0); // Default for "tomorrow" with no stated hour.
  }
  return date;
}

export function parseWhen(input: string, now = Date.now()): ParsedWhen | null {
  if (!input) return null;

  const text = input.toLowerCase().trim();
  const nowDate = new Date(now);
  const time = extractTimeOfDay(text);

  // "in 20 minutes", "in 2 hours"
  const relative = text.match(/\bin\s+(a|an|\d+)\s+(minute|minutes|min|mins|hour|hours|hr|hrs|day|days|week|weeks)\b/);
  if (relative) {
    const count = relative[1] === 'a' || relative[1] === 'an' ? 1 : Number(relative[1]);
    const unit = UNIT_MS[relative[2]];
    if (unit) return { at: now + count * unit, hadExplicitTime: true };
  }

  if (/\btonight\b/.test(text)) {
    return { at: atTime(nowDate, time ?? { hours: 20, minutes: 0 }).getTime(), hadExplicitTime: true };
  }

  if (/\btomorrow\b/.test(text)) {
    const date = new Date(now + 86_400_000);
    return { at: atTime(date, time).getTime(), hadExplicitTime: Boolean(time) };
  }

  if (/\bday after tomorrow\b/.test(text)) {
    const date = new Date(now + 2 * 86_400_000);
    return { at: atTime(date, time).getTime(), hadExplicitTime: Boolean(time) };
  }

  // "next monday", "on friday", "tuesday at 3pm"
  for (const [name, weekday] of Object.entries(WEEKDAYS)) {
    if (!new RegExp(`\\b${name}\\b`).test(text)) continue;

    const wantNext = /\bnext\b/.test(text);
    const date = new Date(now);
    let delta = (weekday - date.getDay() + 7) % 7;
    if (delta === 0 || (wantNext && delta < 7)) delta = delta === 0 ? 7 : delta;
    date.setDate(date.getDate() + delta);
    return { at: atTime(date, time).getTime(), hadExplicitTime: Boolean(time) };
  }

  if (/\btoday\b/.test(text) || time) {
    const candidate = atTime(nowDate, time);
    // A time that already passed today almost always means tomorrow.
    if (candidate.getTime() <= now) candidate.setDate(candidate.getDate() + 1);
    return { at: candidate.getTime(), hadExplicitTime: Boolean(time) };
  }

  // Last resort: a real date string the model may have produced.
  const parsed = Date.parse(input);
  if (!Number.isNaN(parsed)) return { at: parsed, hadExplicitTime: true };

  return null;
}

export function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
