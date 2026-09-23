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
  domingo: 0,
  monday: 1,
  mon: 1,
  lunes: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  martes: 2,
  wednesday: 3,
  wed: 3,
  miercoles: 3,
  miércoles: 3,
  thursday: 4,
  thu: 4,
  thurs: 4,
  jueves: 4,
  friday: 5,
  fri: 5,
  viernes: 5,
  saturday: 6,
  sat: 6,
  sabado: 6,
  sábado: 6,
};

const UNIT_MS: Record<string, number> = {
  minute: 60_000,
  minutes: 60_000,
  min: 60_000,
  mins: 60_000,
  minuto: 60_000,
  minutos: 60_000,
  hour: 3_600_000,
  hours: 3_600_000,
  hr: 3_600_000,
  hrs: 3_600_000,
  hora: 3_600_000,
  horas: 3_600_000,
  day: 86_400_000,
  days: 86_400_000,
  dia: 86_400_000,
  dias: 86_400_000,
  día: 86_400_000,
  días: 86_400_000,
  week: 604_800_000,
  weeks: 604_800_000,
  semana: 604_800_000,
  semanas: 604_800_000,
};

export type ParsedWhen = { at: number; hadExplicitTime: boolean };

/** Extracts a clock time like "9", "9am", "9:30 pm", "18:00", "a las 7". */
function extractTimeOfDay(text: string): { hours: number; minutes: number } | null {
  const match = text.match(
    /\b(?:at\s+|a\s+las?\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|de\s+la\s+mañana|de\s+la\s+tarde|de\s+la\s+noche)?\b/,
  );
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  const meridiemRaw = match[3]?.replace(/\./g, '').toLowerCase() ?? '';

  if (hours > 23 || minutes > 59) return null;

  const pm = meridiemRaw === 'pm' || meridiemRaw.includes('tarde') || meridiemRaw.includes('noche');
  const am = meridiemRaw === 'am' || meridiemRaw.includes('mañana');

  if (pm && hours < 12) hours += 12;
  if (am && hours === 12) hours = 0;

  // "at 8" with no am/pm and no 24h context: assume the next sensible 8 o'clock.
  if (!am && !pm && hours <= 7) hours += 12;

  return { hours, minutes };
}

/** Morning, noon, afternoon, evening, and night, in English and Spanish. */
function namedClock(text: string): { hours: number; minutes: number } | null {
  if (/\b(noon|midday|mediodia)\b/.test(text)) return { hours: 12, minutes: 0 };
  if (/\b((?:por|de) la manana|morning)\b/.test(text)) return { hours: 9, minutes: 0 };
  if (/\b((?:por|de) la tarde|afternoon)\b/.test(text)) return { hours: 15, minutes: 0 };
  if (/\bevening\b/.test(text)) return { hours: 18, minutes: 0 };
  if (/\b((?:por|de) la noche|night)\b/.test(text)) return { hours: 21, minutes: 0 };
  return null;
}

/** "por la mañana" is a time of day, not the word tomorrow. */
function withoutNamedMorning(text: string): string {
  return text.replace(/\b(?:por|de) la manana\b/g, ' ');
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

  const text = input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  const nowDate = new Date(now);
  const time = extractTimeOfDay(text);
  const named = namedClock(text);
  const clock = time ?? named;
  const explicit = Boolean(time || named);
  const dayText = withoutNamedMorning(text);

  // "in 20 minutes", "en 20 minutos", "en una hora"
  const relative = text.match(
    /\b(?:in|en)\s+(a|an|una|un|\d+)\s+(minute|minutes|min|mins|minuto|minutos|hour|hours|hr|hrs|hora|horas|day|days|dia|dias|week|weeks|semana|semanas)\b/,
  );
  if (relative) {
    const count =
      relative[1] === 'a' || relative[1] === 'an' || relative[1] === 'una' || relative[1] === 'un'
        ? 1
        : Number(relative[1]);
    const unit = UNIT_MS[relative[2]];
    if (unit) return { at: now + count * unit, hadExplicitTime: true };
  }

  if (/\b(tonight|esta noche)\b/.test(text)) {
    return { at: atTime(nowDate, time ?? { hours: 20, minutes: 0 }).getTime(), hadExplicitTime: true };
  }

  if (/\b(day after tomorrow|pasado manana)\b/.test(dayText)) {
    const date = new Date(now + 2 * 86_400_000);
    return { at: atTime(date, clock).getTime(), hadExplicitTime: explicit };
  }

  if (/\b(tomorrow|manana)\b/.test(dayText)) {
    const date = new Date(now + 86_400_000);
    return { at: atTime(date, clock).getTime(), hadExplicitTime: explicit };
  }

  // "next monday", "on friday", "tuesday at 3pm", "el lunes"
  for (const [name, weekday] of Object.entries(WEEKDAYS)) {
    const plain = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (!new RegExp(`\\b${plain}\\b`).test(dayText)) continue;

    const wantNext = /\b(next|proximo|siguiente)\b/.test(dayText);
    const date = new Date(now);
    let delta = (weekday - date.getDay() + 7) % 7;
    if (delta === 0 || (wantNext && delta < 7)) delta = delta === 0 ? 7 : delta;
    date.setDate(date.getDate() + delta);
    return { at: atTime(date, clock).getTime(), hadExplicitTime: explicit };
  }

  if (/\b(today|hoy)\b/.test(dayText) || clock) {
    const candidate = atTime(nowDate, clock);
    // A time that already passed today almost always means tomorrow.
    if (candidate.getTime() <= now) candidate.setDate(candidate.getDate() + 1);
    return { at: candidate.getTime(), hadExplicitTime: explicit };
  }

  // Last resort: a real date string the model may have produced.
  const parsed = Date.parse(input);
  if (!Number.isNaN(parsed)) return { at: parsed, hadExplicitTime: true };

  return null;
}

export function formatWhen(ms: number, locale?: string): string {
  return new Date(ms).toLocaleString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export type AlarmRepeat = 'once' | 'daily';

export const SNOOZE_MS = 10 * 60_000;

/** Daily only when the user's own words say so. */
export function parseRepeat(when: string): AlarmRepeat {
  return /\b(every\s+day|everyday|daily|todos los dias|cada dia|diario)\b/i.test(
    when.normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
  )
    ? 'daily'
    : 'once';
}

export type ReminderCadence = 'once' | 'daily' | 'weekly';

export function parseReminderRepeat(when: string): ReminderCadence {
  const text = when.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/\b(every\s+week|weekly|cada semana|todas las semanas)\b/i.test(text)) return 'weekly';
  return parseRepeat(when) === 'daily' ? 'daily' : 'once';
}

/** Next clock time at hour:minute, rolling to tomorrow if that instant has passed. */
export function nextOccurrence(hour: number, minute: number, from = Date.now()): number {
  const date = new Date(from);
  date.setSeconds(0, 0);
  date.setHours(hour, minute, 0, 0);
  if (date.getTime() <= from) date.setDate(date.getDate() + 1);
  return date.getTime();
}

export function formatClockTime(hour: number, minute: number, locale?: string): string {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}
