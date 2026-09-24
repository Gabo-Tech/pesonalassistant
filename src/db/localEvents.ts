import { getDb, now } from './index';
import { expandEvents, type EventRepeat, type Occurrence } from '../calendar/expand';
import { cancelReminderNotification, scheduleEventAlert } from '../notify';
import { rescheduleAnchoredReminders } from './reminders';

export type LocalEvent = {
  id: number;
  title: string;
  start_at: number;
  end_at: number;
  location: string;
  all_day: number;
  repeat: EventRepeat;
  alert_minutes: number | null;
  alert_notification_id: string | null;
};

function asRepeat(value: string | undefined): EventRepeat {
  if (value === 'daily' || value === 'weekly' || value === 'monthly') return value;
  return 'none';
}

async function scheduleAlert(
  id: number,
  title: string,
  start: number,
  minutes: number | null,
): Promise<string | null> {
  if (minutes == null) return null;
  const at = start - minutes * 60_000;
  if (at <= Date.now()) return null;
  return scheduleEventAlert(id, title, at);
}

export async function createLocalEvent(input: {
  title: string;
  start: number;
  end: number;
  location?: string;
  allDay?: boolean;
  repeat?: EventRepeat;
  alertMinutes?: number | null;
}): Promise<LocalEvent> {
  const db = await getDb();
  const ts = now();
  const location = input.location ?? '';
  const allDay = input.allDay ? 1 : 0;
  const repeat = asRepeat(input.repeat);
  const alertMinutes = input.alertMinutes ?? null;
  const result = await db.runAsync(
    `INSERT INTO local_events (
       title, start_at, end_at, location, all_day, repeat, alert_minutes, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.title,
    input.start,
    input.end,
    location,
    allDay,
    repeat,
    alertMinutes,
    ts,
    ts,
  );
  const id = result.lastInsertRowId;
  const alertId = await scheduleAlert(id, input.title, input.start, alertMinutes);
  if (alertId) {
    await db.runAsync('UPDATE local_events SET alert_notification_id = ? WHERE id = ?', alertId, id);
  }
  return {
    id,
    title: input.title,
    start_at: input.start,
    end_at: input.end,
    location,
    all_day: allDay,
    repeat,
    alert_minutes: alertMinutes,
    alert_notification_id: alertId,
  };
}

/** One-shot rows in the window, plus repeating series that started before it ends. */
export async function listOccurrences(from: number, to: number): Promise<Occurrence[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<LocalEvent>(
    `SELECT * FROM local_events
     WHERE start_at < ? AND (repeat != 'none' OR end_at > ?)
     ORDER BY start_at ASC`,
    to,
    from,
  );
  return expandEvents(
    rows.map((row) => ({
      id: row.id,
      title: row.title,
      start: row.start_at,
      end: row.end_at,
      location: row.location,
      allDay: row.all_day === 1,
      repeat: asRepeat(row.repeat),
      alertMinutes: row.alert_minutes,
    })),
    from,
    to,
  );
}

export async function updateLocalEvent(
  id: number,
  patch: {
    title?: string;
    start?: number;
    end?: number;
    location?: string;
    allDay?: boolean;
    repeat?: EventRepeat;
    alertMinutes?: number | null;
  },
): Promise<void> {
  const db = await getDb();
  const current = await db.getFirstAsync<LocalEvent>('SELECT * FROM local_events WHERE id = ?', id);
  if (!current) return;
  const title = patch.title ?? current.title;
  const start = patch.start ?? current.start_at;
  const end = patch.end ?? current.end_at;
  const alertMinutes = patch.alertMinutes === undefined ? current.alert_minutes : patch.alertMinutes;
  await cancelReminderNotification(current.alert_notification_id);
  const alertId = await scheduleAlert(id, title, start, alertMinutes);
  await db.runAsync(
    `UPDATE local_events
     SET title = ?, start_at = ?, end_at = ?, location = ?, all_day = ?, repeat = ?,
         alert_minutes = ?, alert_notification_id = ?, updated_at = ?
     WHERE id = ?`,
    title,
    start,
    end,
    patch.location ?? current.location,
    patch.allDay == null ? current.all_day : patch.allDay ? 1 : 0,
    patch.repeat ?? asRepeat(current.repeat),
    alertMinutes,
    alertId,
    now(),
    id,
  );
  if (end !== current.end_at || start !== current.start_at) {
    await rescheduleAnchoredReminders(id, start, end);
  }
}

export async function getLocalEvent(id: number): Promise<LocalEvent | null> {
  if (!Number.isFinite(id)) return null;
  const db = await getDb();
  return db.getFirstAsync<LocalEvent>('SELECT * FROM local_events WHERE id = ?', id);
}

export async function deleteLocalEvent(id: number): Promise<void> {
  const db = await getDb();
  const current = await db.getFirstAsync<LocalEvent>('SELECT * FROM local_events WHERE id = ?', id);
  await cancelReminderNotification(current?.alert_notification_id ?? null);
  await db.runAsync('DELETE FROM local_events WHERE id = ?', id);
}
