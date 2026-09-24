export type CalendarKind = 'event' | 'task' | 'reminder';

export type CalendarItem = {
  kind: CalendarKind;
  id: string;
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  location?: string;
};

export type ReminderPoint = {
  id: number;
  text: string;
  dueAt: number;
  repeat: 'once' | 'daily' | 'weekly';
};

export type MonthCell = {
  year: number;
  month: number;
  day: number;
  inMonth: boolean;
};

export function dayKeyFromParts(year: number, month: number, day: number): string {
  return `${year}-${month}-${day}`;
}

export function dayKey(ms: number): string {
  const date = new Date(ms);
  return dayKeyFromParts(date.getFullYear(), date.getMonth(), date.getDate());
}

export function weekStartsOn(locale: string): 0 | 1 {
  return locale.startsWith('es') ? 1 : 0;
}

/** Sunday-first or Monday-first cells covering the month, including leading and trailing days. */
export function monthCells(year: number, month: number, startsOn: 0 | 1): MonthCell[] {
  const firstWeekday = new Date(year, month, 1).getDay();
  const lead = (firstWeekday - startsOn + 7) % 7;
  const start = new Date(year, month, 1 - lead);
  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({
      year: date.getFullYear(),
      month: date.getMonth(),
      day: date.getDate(),
      inMonth: date.getMonth() === month && date.getFullYear() === year,
    });
  }
  return cells;
}

export function gridRange(cells: MonthCell[]): { from: number; to: number } {
  const first = cells[0];
  const last = cells[cells.length - 1];
  if (!first || !last) return { from: 0, to: 0 };
  return {
    from: new Date(first.year, first.month, first.day).getTime(),
    to: new Date(last.year, last.month, last.day + 1).getTime(),
  };
}

/**
 * Next time to offer when adding from a day: 9:00 if that is still ahead,
 * otherwise the next hour on today.
 */
export function presetForDay(year: number, month: number, day: number, now = Date.now()): number {
  const morning = new Date(year, month, day, 9, 0, 0, 0).getTime();
  if (morning > now) return morning;
  const today = new Date(now);
  const isToday =
    today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
  if (!isToday) return morning;
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  if (next.getFullYear() !== year || next.getMonth() !== month || next.getDate() !== day) {
    return new Date(year, month, day, 23, 59, 0, 0).getTime();
  }
  return next.getTime();
}

function stepDays(ms: number, days: number): number {
  const date = new Date(ms);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

/** Open reminders in the window. Daily and weekly series step forward from their next due time. */
export function expandReminderPoints(
  rows: ReminderPoint[],
  from: number,
  to: number,
): { id: number; text: string; at: number }[] {
  const out: { id: number; text: string; at: number }[] = [];
  for (const row of rows) {
    if (row.repeat === 'once') {
      if (row.dueAt >= from && row.dueAt < to) out.push({ id: row.id, text: row.text, at: row.dueAt });
      continue;
    }
    const days = row.repeat === 'weekly' ? 7 : 1;
    let cursor = row.dueAt;
    let guard = 0;
    while (cursor < from && guard < 4000) {
      const next = stepDays(cursor, days);
      if (next <= cursor) break;
      cursor = next;
      guard += 1;
    }
    let steps = 0;
    while (cursor < to && steps < 400) {
      if (cursor >= from) out.push({ id: row.id, text: row.text, at: cursor });
      const next = stepDays(cursor, days);
      if (next <= cursor) break;
      cursor = next;
      steps += 1;
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

export function bucketByDay<T extends { start: number }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = dayKey(item.start);
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  for (const bucket of map.values()) bucket.sort((a, b) => a.start - b.start);
  return map;
}

type SourceEvent = {
  id: string;
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  location?: string;
};

export function assembleCalendarItems(input: {
  from: number;
  to: number;
  events: SourceEvent[];
  tasks: { id: number; title: string; dueAt: number | null }[];
  reminders: ReminderPoint[];
}): CalendarItem[] {
  const items: CalendarItem[] = [];
  for (const event of input.events) {
    items.push({
      kind: 'event',
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      allDay: event.allDay,
      location: event.location,
    });
  }
  for (const task of input.tasks) {
    if (task.dueAt == null || task.dueAt < input.from || task.dueAt >= input.to) continue;
    items.push({
      kind: 'task',
      id: String(task.id),
      title: task.title,
      start: task.dueAt,
      end: task.dueAt,
      allDay: false,
    });
  }
  for (const hit of expandReminderPoints(input.reminders, input.from, input.to)) {
    items.push({
      kind: 'reminder',
      id: String(hit.id),
      title: hit.text,
      start: hit.at,
      end: hit.at,
      allDay: false,
    });
  }
  return items.sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));
}

function asReminderRepeat(value: string | undefined): ReminderPoint['repeat'] {
  if (value === 'daily' || value === 'weekly') return value;
  return 'once';
}

/** Events from the active calendar, plus open tasks and reminders that fall in the window. */
export async function loadCalendarItems(
  from: number,
  to: number,
  mode: 'app' | 'phone',
): Promise<{ items: CalendarItem[]; denied: boolean }> {
  const [{ listTasks }, { listReminders }] = await Promise.all([
    import('../db/tasks'),
    import('../db/reminders'),
  ]);
  const [taskRows, reminderRows] = await Promise.all([listTasks('open'), listReminders()]);

  let denied = false;
  let events: SourceEvent[] = [];
  if (mode === 'phone') {
    const { ensureCalendarPermission, listEvents } = await import('./events');
    const granted = await ensureCalendarPermission();
    denied = !granted;
    if (granted) {
      const rows = await listEvents(from, to);
      events = rows.map((row) => ({
        id: row.id,
        title: row.title,
        start: row.start,
        end: row.end,
        allDay: row.allDay,
        location: row.location,
      }));
    }
  } else {
    const { listOccurrences } = await import('../db/localEvents');
    const rows = await listOccurrences(from, to);
    events = rows.map((row) => ({
      id: String(row.id),
      title: row.title,
      start: row.occurrenceStart,
      end: row.occurrenceEnd,
      allDay: row.allDay,
      location: row.location || undefined,
    }));
  }

  return {
    denied,
    items: assembleCalendarItems({
      from,
      to,
      events,
      tasks: taskRows.map((row) => ({ id: row.id, title: row.title, dueAt: row.due_at })),
      reminders: reminderRows.map((row) => ({
        id: row.id,
        text: row.text,
        dueAt: row.due_at,
        repeat: asReminderRepeat(row.repeat),
      })),
    }),
  };
}
