/**
 * A spoken summary of one span, built only from data the caller already loaded.
 * "How is my week?" never sends the calendar to a model.
 */

export type BriefSpan = 'today' | 'tomorrow' | 'this week' | 'next week';

export type BriefEvent = { title: string; start: number };
export type BriefReminder = { text: string; dueAt: number };
export type BriefTask = { title: string; dueAt: number | null; status: 'open' | 'done' };

export type BriefInput = {
  now: number;
  span: BriefSpan;
  from: number;
  to: number;
  events: BriefEvent[];
  reminders: BriefReminder[];
  tasks: BriefTask[];
  locale: 'en' | 'es';
};

const DAY_MS = 86_400_000;
const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_ES = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];

export function weekBounds(now: number, which: 'this' | 'next'): { from: number; to: number } {
  const date = new Date(now);
  const mondayDelta = date.getDay() === 0 ? -6 : 1 - date.getDay();
  const monday = new Date(date);
  monday.setDate(date.getDate() + mondayDelta);
  monday.setHours(0, 0, 0, 0);
  if (which === 'next') monday.setDate(monday.getDate() + 7);
  return { from: monday.getTime(), to: monday.getTime() + 7 * DAY_MS };
}

export function briefWindow(when: string, now = Date.now()): { span: BriefSpan; from: number; to: number } {
  const text = when
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (/\b(next week|semana que viene|proxima semana)\b/.test(text)) {
    const week = weekBounds(now, 'next');
    return { span: 'next week', ...week };
  }
  if (/\b(tomorrow|manana)\b/.test(text) && !/\b(week|semana)\b/.test(text)) {
    return { span: 'tomorrow', ...dayWindow(now + DAY_MS) };
  }
  if (/\b(today|hoy)\b/.test(text)) {
    return { span: 'today', ...dayWindow(now) };
  }
  const week = weekBounds(now, 'this');
  return { span: 'this week', ...week };
}

function dayWindow(ms: number): { from: number; to: number } {
  const start = new Date(ms);
  start.setHours(0, 0, 0, 0);
  return { from: start.getTime(), to: start.getTime() + DAY_MS };
}

export function buildBrief(input: BriefInput): string {
  const inRange = (at: number) => at >= input.from && at < input.to;
  const appointments = input.events.filter((event) => inRange(event.start)).sort((a, b) => a.start - b.start);
  const reminders = input.reminders
    .filter((reminder) => inRange(reminder.dueAt))
    .sort((a, b) => a.dueAt - b.dueAt);
  const tasks = input.tasks
    .filter((task) => task.status === 'open' && task.dueAt != null && inRange(task.dueAt))
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
  const overdue = input.tasks
    .filter((task) => task.status === 'open' && task.dueAt != null && task.dueAt < input.from)
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));

  const es = input.locale === 'es';
  const heading = spanLabel(input.span, es);
  if (appointments.length + reminders.length + tasks.length + overdue.length === 0) {
    return es ? `${heading} está libre.` : `${heading} is clear.`;
  }

  const counts = es
    ? `${heading}: ${count(appointments.length, 'cita', 'citas')}, ${count(reminders.length, 'recordatorio', 'recordatorios')}, ${count(tasks.length, 'tarea', 'tareas')}.`
    : `${heading}: ${count(appointments.length, 'appointment', 'appointments')}, ${count(reminders.length, 'reminder', 'reminders')}, ${count(tasks.length, 'task', 'tasks')}.`;

  const next = [
    ...appointments.map((event) => `${event.title} ${stamp(event.start, es)}`),
    ...reminders.map((reminder) => `${reminder.text} ${stamp(reminder.dueAt, es)}`),
    ...tasks.map((task) => `${task.title} ${stamp(task.dueAt ?? input.now, es)}`),
  ].slice(0, 5);

  const lines = [counts];
  if (next.length > 0) lines.push(es ? `Siguiente: ${next.join('; ')}.` : `Next: ${next.join('; ')}.`);
  if (overdue.length > 0) {
    const names = overdue
      .slice(0, 3)
      .map((task) => task.title)
      .join(', ');
    lines.push(es ? `Atrasadas: ${names}.` : `Overdue: ${names}.`);
  }
  return lines.join(' ');
}

function spanLabel(span: BriefSpan, es: boolean): string {
  if (es) {
    if (span === 'today') return 'Hoy';
    if (span === 'tomorrow') return 'Mañana';
    if (span === 'next week') return 'La semana que viene';
    return 'Esta semana';
  }
  if (span === 'today') return 'Today';
  if (span === 'tomorrow') return 'Tomorrow';
  if (span === 'next week') return 'Next week';
  return 'This week';
}

function stamp(ms: number, es: boolean): string {
  const date = new Date(ms);
  const day = (es ? WEEKDAY_ES : WEEKDAY_EN)[date.getDay()];
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day} ${hours}:${minutes}`;
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
