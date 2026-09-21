import * as Calendar from 'expo-calendar';
import { peekSettings, saveSettings } from '../settings/store';

/**
 * expo-calendar in SDK 57: the old `createEventAsync` / `getEventsAsync` helpers now
 * throw at runtime. Everything here uses the object API: get an `ExpoCalendar`, then
 * call methods on it.
 */

export type SimpleEvent = {
  id: string;
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  location?: string;
};

export async function ensureCalendarPermission(): Promise<boolean> {
  const current = await Calendar.getCalendarPermissions();
  if (current.granted) return true;
  const asked = await Calendar.requestCalendarPermissions();
  return asked.granted;
}

/** Calendars we are actually allowed to write events into. */
export async function writableCalendars(): Promise<Calendar.ExpoCalendar[]> {
  if (!(await ensureCalendarPermission())) return [];
  const all = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  return all.filter((c) => c.allowsModifications);
}

/**
 * Android has no single "default calendar" API, so pick the primary writable one
 * and remember the choice. The user can override it in Settings.
 */
export async function resolveCalendar(): Promise<Calendar.ExpoCalendar | null> {
  const candidates = await writableCalendars();
  if (candidates.length === 0) return null;

  const saved = peekSettings().calendarId;
  const chosen =
    candidates.find((c) => c.id === saved) ??
    candidates.find((c) => c.isPrimary) ??
    candidates[0];

  if (chosen.id !== saved) await saveSettings({ calendarId: chosen.id });
  return chosen;
}

export async function createEvent(input: {
  title: string;
  start: number;
  end?: number;
  notes?: string;
  location?: string;
}): Promise<SimpleEvent> {
  const calendar = await resolveCalendar();
  if (!calendar) throw new Error('No writable calendar on this device');

  // Default to a one hour block when the user only says a start time.
  const end = input.end ?? input.start + 60 * 60 * 1000;

  const event = await calendar.createEvent({
    title: input.title,
    startDate: new Date(input.start),
    endDate: new Date(end),
    notes: input.notes,
    location: input.location,
    timeZone: calendar.timeZone ?? undefined,
  });

  return {
    id: event.id,
    title: input.title,
    start: input.start,
    end,
    allDay: false,
    location: input.location,
  };
}

export async function listEvents(fromMs: number, toMs: number): Promise<SimpleEvent[]> {
  const calendars = await writableCalendars();
  if (calendars.length === 0) return [];

  const events = await Calendar.listEvents(calendars, new Date(fromMs), new Date(toMs));

  return events
    .map((e) => ({
      id: e.id,
      title: e.title ?? '(untitled)',
      start: toMillis(e.startDate),
      end: toMillis(e.endDate),
      allDay: Boolean(e.allDay),
      location: e.location ?? undefined,
    }))
    .sort((a, b) => a.start - b.start);
}

function toMillis(value: Date | string | undefined): number {
  if (!value) return 0;
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}
