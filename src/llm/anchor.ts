/**
 * "Right after the dentist" / "2 hours before the meeting this Friday"
 * is resolved against appointments the caller already loaded. This file stays
 * free of the database so tests can run it directly.
 */

export type AnchorEvent = {
  id: string;
  title: string;
  start: number;
  end: number;
};

export type AnchorResolution =
  | { kind: 'time'; at: number; eventId: string; title: string; offsetMs: number }
  | { kind: 'ambiguous' }
  | { kind: 'none' };

/** Negative offset = before start; non-negative = after end. */
export type ParsedEventAnchor = {
  query: string;
  offsetMs: number;
  dayFrom: number | null;
  dayTo: number | null;
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
};

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
};

const MONTHS: Record<string, number> = {
  january: 0,
  jan: 0,
  enero: 0,
  february: 1,
  feb: 1,
  febrero: 1,
  march: 2,
  mar: 2,
  marzo: 2,
  april: 3,
  apr: 3,
  abril: 3,
  may: 4,
  mayo: 4,
  june: 5,
  jun: 5,
  junio: 5,
  july: 6,
  jul: 6,
  julio: 6,
  august: 7,
  aug: 7,
  agosto: 7,
  september: 8,
  sep: 8,
  sept: 8,
  septiembre: 8,
  october: 9,
  oct: 9,
  octubre: 9,
  november: 10,
  nov: 10,
  noviembre: 10,
  december: 11,
  dec: 11,
  diciembre: 11,
};

const MONTH_NAMES = Object.keys(MONTHS).join('|');
const GENERIC_EVENT = /\b(appointment|cita|evento|meeting|reunion)\b/gi;

function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function startOfDay(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function endOfDay(ms: number): number {
  const date = new Date(ms);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

/** Day window for "this Friday" / "November 20" filters on agenda events. */
function dayBoundsFromWhen(input: string, now: number): { from: number; to: number } | null {
  const dayText = fold(input);
  if (!dayText) return null;

  const en = dayText.match(new RegExp(`\\b(${MONTH_NAMES})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`));
  if (en) {
    const month = MONTHS[en[1]];
    const day = Number(en[2]);
    if (month != null && day >= 1 && day <= 31) {
      const date = new Date(new Date(now).getFullYear(), month, day);
      if (endOfDay(date.getTime()) < now) date.setFullYear(date.getFullYear() + 1);
      return { from: startOfDay(date.getTime()), to: endOfDay(date.getTime()) };
    }
  }

  const es = dayText.match(new RegExp(`\\b(\\d{1,2})\\s+de\\s+(${MONTH_NAMES})\\b`));
  if (es) {
    const day = Number(es[1]);
    const month = MONTHS[es[2]];
    if (month != null && day >= 1 && day <= 31) {
      const date = new Date(new Date(now).getFullYear(), month, day);
      if (endOfDay(date.getTime()) < now) date.setFullYear(date.getFullYear() + 1);
      return { from: startOfDay(date.getTime()), to: endOfDay(date.getTime()) };
    }
  }

  if (/\b(day after tomorrow|pasado manana)\b/.test(dayText)) {
    const ms = now + 2 * 86_400_000;
    return { from: startOfDay(ms), to: endOfDay(ms) };
  }
  if (/\b(tomorrow|manana)\b/.test(dayText)) {
    const ms = now + 86_400_000;
    return { from: startOfDay(ms), to: endOfDay(ms) };
  }
  if (/\b(today|hoy)\b/.test(dayText)) {
    return { from: startOfDay(now), to: endOfDay(now) };
  }

  for (const [name, weekday] of Object.entries(WEEKDAYS)) {
    if (!new RegExp(`\\b${name}\\b`).test(dayText)) continue;
    const wantNext = /\b(next|proximo|siguiente)\b/.test(dayText);
    const date = new Date(now);
    let delta = (weekday - date.getDay() + 7) % 7;
    if (delta === 0 || (wantNext && delta < 7)) delta = delta === 0 ? 7 : delta;
    date.setDate(date.getDate() + delta);
    return { from: startOfDay(date.getTime()), to: endOfDay(date.getTime()) };
  }

  return null;
}

function offsetFromMatch(countRaw: string | undefined, unitRaw: string | undefined): number {
  if (!countRaw || !unitRaw) return 3_600_000;
  const count =
    countRaw === 'a' || countRaw === 'an' || countRaw === 'una' || countRaw === 'un' ? 1 : Number(countRaw);
  return count * (UNIT_MS[unitRaw] ?? 3_600_000);
}

function cleanQuery(raw: string): string {
  const folded = fold(raw);
  const withoutDay = folded
    .replace(
      /\b(this|next|el|la|los|las|este|esta|proximo|siguiente|on|today|hoy|tomorrow|manana|tonight|esta noche)\b/g,
      ' ',
    )
    .replace(
      /\b(sunday|sun|domingo|monday|mon|lunes|tuesday|tue|tues|martes|wednesday|wed|miercoles|thursday|thu|thurs|jueves|friday|fri|viernes|saturday|sat|sabado)\b/g,
      ' ',
    )
    .replace(new RegExp(`\\b(${MONTH_NAMES})\\b`, 'g'), ' ')
    .replace(/\b\d{1,2}(?:st|nd|rd|th)?\b/g, ' ')
    .replace(/\bde\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const specific = withoutDay.replace(GENERIC_EVENT, ' ').replace(/\s+/g, ' ').trim();
  if (specific) return specific;

  const generic = withoutDay.match(/\b(appointment|cita|evento|meeting|reunion)\b/);
  return generic?.[1] ?? '';
}

/** Parse "2 hours before the meeting this Friday" / "right after the dentist". */
export function parseEventAnchor(when: string, now = Date.now()): ParsedEventAnchor | null {
  const text = fold(when);
  if (!text) return null;

  const before = text.match(
    /^(?:(a|an|una|un|\d+)\s+(minute|minutes|min|mins|minuto|minutos|hour|hours|hr|hrs|hora|horas)\s+)?(?:before|antes\s+de)\s+(?:my |the |el |la |mi |una )?(.+)$/,
  );
  if (before) {
    const amount = before[1] ? offsetFromMatch(before[1], before[2]) : 3_600_000;
    const rest = before[3].trim();
    const bounds = dayBoundsFromWhen(rest, now);
    return {
      query: cleanQuery(rest),
      offsetMs: -amount,
      dayFrom: bounds?.from ?? null,
      dayTo: bounds?.to ?? null,
    };
  }

  const namedBefore = text.match(
    /^(?:an?\s+hour|una\s+hora)\s+(?:before|antes\s+de)\s+(?:my |the |el |la |mi |una )?(.+)$/,
  );
  if (namedBefore) {
    const rest = namedBefore[1].trim();
    const bounds = dayBoundsFromWhen(rest, now);
    return {
      query: cleanQuery(rest),
      offsetMs: -3_600_000,
      dayFrom: bounds?.from ?? null,
      dayTo: bounds?.to ?? null,
    };
  }

  const after = text.match(
    /^(?:(a|an|una|un|\d+)\s+(minute|minutes|min|mins|minuto|minutos|hour|hours|hr|hrs|hora|horas)\s+)?(?:right after|just after|after|justo despues de|despues de|tras)\s+(?:my |the |el |la |mi |una )?(.+)$/,
  );
  if (after) {
    const amount = after[1] ? offsetFromMatch(after[1], after[2]) : 0;
    const rest = after[3].trim();
    const bounds = dayBoundsFromWhen(rest, now);
    return {
      query: cleanQuery(rest),
      offsetMs: amount,
      dayFrom: bounds?.from ?? null,
      dayTo: bounds?.to ?? null,
    };
  }

  return null;
}

/** True when `when` is an agenda-anchored phrase (before or after an event). */
export function eventQueryFromWhen(when: string): string | null {
  const parsed = parseEventAnchor(when);
  if (!parsed) return null;
  // Empty query is still valid when a day filter narrows the agenda (e.g. "before the meeting Friday").
  return parsed.query || (parsed.dayFrom != null ? '*' : null);
}

function dueAt(event: AnchorEvent, offsetMs: number): number {
  return offsetMs < 0 ? event.start + offsetMs : event.end + offsetMs;
}

function pick(events: AnchorEvent[], offsetMs: number): AnchorResolution {
  if (events.length === 0) return { kind: 'none' };
  if (events.length > 1) return { kind: 'ambiguous' };
  const event = events[0];
  return {
    kind: 'time',
    at: dueAt(event, offsetMs),
    eventId: event.id,
    title: event.title,
    offsetMs,
  };
}

function inDay(event: AnchorEvent, from: number | null, to: number | null): boolean {
  if (from == null || to == null) return true;
  return event.start >= from && event.start <= to;
}

export function resolveEventAnchor(
  when: string,
  events: AnchorEvent[],
  now = Date.now(),
): AnchorResolution {
  const parsed = parseEventAnchor(when, now);
  if (!parsed) return { kind: 'none' };

  const pool = events.filter((event) => inDay(event, parsed.dayFrom, parsed.dayTo));
  if (pool.length === 0) return { kind: 'none' };

  if (parsed.query) {
    const exact = pool.filter((event) => fold(event.title) === parsed.query);
    if (exact.length === 1) return pick(exact, parsed.offsetMs);
    if (exact.length > 1) return { kind: 'ambiguous' };

    const contained = pool.filter((event) => {
      const title = fold(event.title);
      return title.includes(parsed.query) || parsed.query.includes(title);
    });
    if (contained.length === 1) return pick(contained, parsed.offsetMs);
    if (contained.length > 1) return { kind: 'ambiguous' };
    // Title miss with a day window: fall through to day-only matching below.
    if (parsed.dayFrom == null) return { kind: 'none' };
  }

  // Generic "the meeting this Friday" / empty query + day → the single event that day.
  return pick(pool, parsed.offsetMs);
}

/** Prefer resolveEventAnchor — kept for older call sites/tests. */
export function resolveAfterEvent(when: string, events: AnchorEvent[]): AnchorResolution {
  return resolveEventAnchor(when, events);
}
