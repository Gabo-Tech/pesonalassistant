export type EventRepeat = 'none' | 'daily' | 'weekly' | 'monthly';

export type SeriesEvent = {
  id: number;
  title: string;
  start: number;
  end: number;
  location: string;
  allDay: boolean;
  repeat: EventRepeat;
  alertMinutes?: number | null;
};

export type Occurrence = SeriesEvent & {
  occurrenceStart: number;
  occurrenceEnd: number;
};

const DAY_MS = 86_400_000;

function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function parseEventRepeat(text: string): EventRepeat {
  const value = fold(text);
  if (/\b(every month|monthly|cada mes|todos los meses)\b/.test(value)) return 'monthly';
  if (/\b(every week|weekly|cada semana|todas las semanas|every (mon|monday|tue|tues|tuesday|wed|wednesday|thu|thurs|thursday|fri|friday|sat|saturday|sun|sunday))\b/.test(value)) {
    return 'weekly';
  }
  if (/\b(every day|everyday|daily|todos los dias|cada dia)\b/.test(value)) return 'daily';
  return 'none';
}

export function parseAllDay(text: string): boolean {
  return /\b(all day|todo el dia)\b/.test(fold(text));
}

/** Minutes before the start, or null when they did not ask for an alert. */
export function parseAlertMinutes(text: string): number | null {
  const value = fold(text);
  if (/\b(an hour before|1 hour before|una hora antes|1 hora antes)\b/.test(value)) return 60;
  if (/\b(10 minutes before|10 minutos antes)\b/.test(value)) return 10;
  if (/\b(a day before|1 day before|un dia antes)\b/.test(value)) return 1440;
  return null;
}

export function expandEvents(events: SeriesEvent[], from: number, to: number): Occurrence[] {
  const out: Occurrence[] = [];
  for (const event of events) {
    const duration = event.allDay ? DAY_MS : Math.max(event.end - event.start, 60_000);
    if (event.repeat === 'none') {
      if (event.start < to && event.start + duration > from) {
        out.push({ ...event, occurrenceStart: event.start, occurrenceEnd: event.start + duration });
      }
      continue;
    }

    let cursor = event.start;
    let steps = 0;
    while (cursor < to && steps < 400) {
      const end = cursor + duration;
      if (end > from && cursor < to) {
        out.push({ ...event, occurrenceStart: cursor, occurrenceEnd: end });
      }
      const next = step(cursor, event.repeat);
      if (next <= cursor) break;
      cursor = next;
      steps += 1;
    }
  }
  return out.sort((a, b) => a.occurrenceStart - b.occurrenceStart);
}

function step(ms: number, repeat: EventRepeat): number {
  const date = new Date(ms);
  if (repeat === 'daily') date.setDate(date.getDate() + 1);
  else if (repeat === 'weekly') date.setDate(date.getDate() + 7);
  else if (repeat === 'monthly') date.setMonth(date.getMonth() + 1);
  return date.getTime();
}
