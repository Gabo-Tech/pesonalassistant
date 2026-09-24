import { getDb, now } from './index';
import { cancelReminderNotification, scheduleReminderNotification } from '../notify';

export type ReminderRepeat = 'once' | 'daily' | 'weekly';

export type Reminder = {
  id: number;
  text: string;
  due_at: number;
  notification_id: string | null;
  completed: number;
  created_at: number;
  /** In-app event this reminder follows. Null for a clock time or a phone-calendar event. */
  anchor_event_id: number | null;
  /** Negative = before start; non-negative = after end. Used when the event moves. */
  anchor_offset_ms: number;
  repeat: ReminderRepeat;
};

function asRepeat(value: string | undefined): ReminderRepeat {
  if (value === 'daily' || value === 'weekly') return value;
  return 'once';
}

/**
 * Creates a reminder row and registers the OS notification that actually wakes
 * the user. The notification is the source of truth for "it went off"; the row
 * exists so the assistant can list and complete reminders.
 */
export async function createReminder(
  text: string,
  dueAt: number,
  anchorEventId?: number | null,
  repeat: ReminderRepeat = 'once',
  anchorOffsetMs = 0,
): Promise<Reminder> {
  if (dueAt <= Date.now()) {
    throw new Error('That time has already passed.');
  }

  const db = await getDb();
  const ts = now();
  const anchor = anchorEventId ?? null;
  const cadence = asRepeat(repeat);
  const offset = Number.isFinite(anchorOffsetMs) ? Math.trunc(anchorOffsetMs) : 0;
  const result = await db.runAsync(
    `INSERT INTO reminders (text, due_at, notification_id, completed, created_at, anchor_event_id, repeat, anchor_offset_ms)
     VALUES (?, ?, NULL, 0, ?, ?, ?, ?)`,
    text,
    dueAt,
    ts,
    anchor,
    cadence,
    offset,
  );
  const id = result.lastInsertRowId;
  const notificationId = await scheduleReminderNotification(text, dueAt, id);
  if (!notificationId) {
    await db.runAsync('DELETE FROM reminders WHERE id = ?', id);
    throw new Error('Cannot set a reminder without notification permission.');
  }
  await db.runAsync('UPDATE reminders SET notification_id = ? WHERE id = ?', notificationId, id);

  return {
    id,
    text,
    due_at: dueAt,
    notification_id: notificationId,
    completed: 0,
    created_at: ts,
    anchor_event_id: anchor,
    anchor_offset_ms: offset,
    repeat: cadence,
  };
}

export async function listReminders(includeCompleted = false): Promise<Reminder[]> {
  const db = await getDb();
  const sql = includeCompleted
    ? 'SELECT * FROM reminders ORDER BY completed ASC, due_at ASC'
    : 'SELECT * FROM reminders WHERE completed = 0 ORDER BY due_at ASC';
  return db.getAllAsync<Reminder>(sql);
}

export async function getReminder(id: number): Promise<Reminder | null> {
  const db = await getDb();
  return db.getFirstAsync<Reminder>('SELECT * FROM reminders WHERE id = ?', id);
}

export async function updateReminder(
  id: number,
  patch: { text?: string; dueAt?: number; repeat?: ReminderRepeat },
): Promise<Reminder> {
  const db = await getDb();
  const existing = await getReminder(id);
  if (!existing) throw new Error(`Reminder ${id} not found`);

  const text = patch.text?.trim() || existing.text;
  const dueAt = patch.dueAt ?? existing.due_at;
  const repeat = patch.repeat ?? asRepeat(existing.repeat);
  if (dueAt <= Date.now()) throw new Error('That time has already passed.');

  await cancelReminderNotification(existing.notification_id);
  const notificationId = await scheduleReminderNotification(text, dueAt, id);
  if (!notificationId) throw new Error('Cannot set a reminder without notification permission.');

  await db.runAsync(
    'UPDATE reminders SET text = ?, due_at = ?, notification_id = ?, repeat = ?, completed = 0 WHERE id = ?',
    text,
    dueAt,
    notificationId,
    repeat,
    id,
  );
  const row = await getReminder(id);
  if (!row) throw new Error('Failed to update reminder');
  return row;
}

const rolling = new Set<number>();

/** After a daily or weekly reminder fires, schedule the next one. */
export async function rollReminderForward(id: number, from = Date.now()): Promise<void> {
  if (rolling.has(id)) return;
  rolling.add(id);
  try {
    const row = await getReminder(id);
    if (!row || row.completed || asRepeat(row.repeat) === 'once') return;
    const days = row.repeat === 'weekly' ? 7 : 1;
    const next = new Date(row.due_at);
    let guard = 0;
    while (next.getTime() <= from && guard < 400) {
      next.setDate(next.getDate() + days);
      guard += 1;
    }
    if (next.getTime() <= from) return;
    await updateReminder(id, { dueAt: next.getTime() });
  } finally {
    rolling.delete(id);
  }
}

/** Moves reminders that were set relative to an in-app event's start or end. */
export async function rescheduleAnchoredReminders(
  eventId: number,
  startAt: number,
  endAt: number,
): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllAsync<Reminder>(
    'SELECT * FROM reminders WHERE anchor_event_id = ? AND completed = 0',
    eventId,
  );
  for (const row of rows) {
    const offset = Number(row.anchor_offset_ms) || 0;
    const dueAt = offset < 0 ? startAt + offset : endAt + offset;
    if (dueAt <= Date.now()) continue;
    if (row.due_at === dueAt) continue;
    await updateReminder(row.id, { dueAt });
  }
}

export async function completeReminder(id: number): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<Reminder>('SELECT * FROM reminders WHERE id = ?', id);
  if (!row) throw new Error(`Reminder ${id} not found`);

  // Completing early must also pull the pending notification, or it still fires.
  await cancelReminderNotification(row.notification_id);
  await db.runAsync('UPDATE reminders SET completed = 1, notification_id = NULL WHERE id = ?', id);
}

export async function deleteReminder(id: number): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<Reminder>('SELECT * FROM reminders WHERE id = ?', id);
  await cancelReminderNotification(row?.notification_id ?? null);
  await db.runAsync('DELETE FROM reminders WHERE id = ?', id);
}
