import { getDb, now } from './index';
import { cancelReminderNotification, scheduleReminderNotification } from '../notify';

export type Reminder = {
  id: number;
  text: string;
  due_at: number;
  notification_id: string | null;
  completed: number;
  created_at: number;
  /** In-app event this reminder follows. Null for a clock time or a phone-calendar event. */
  anchor_event_id: number | null;
};

/**
 * Creates a reminder row and registers the OS notification that actually wakes
 * the user. The notification is the source of truth for "it went off"; the row
 * exists so the assistant can list and complete reminders.
 */
export async function createReminder(
  text: string,
  dueAt: number,
  anchorEventId?: number | null,
): Promise<Reminder> {
  if (dueAt <= Date.now()) {
    throw new Error('That time has already passed.');
  }

  const notificationId = await scheduleReminderNotification(text, dueAt);
  if (!notificationId) {
    throw new Error('Cannot set a reminder without notification permission.');
  }

  const db = await getDb();
  const ts = now();

  const anchor = anchorEventId ?? null;
  const result = await db.runAsync(
    `INSERT INTO reminders (text, due_at, notification_id, completed, created_at, anchor_event_id)
     VALUES (?, ?, ?, 0, ?, ?)`,
    text,
    dueAt,
    notificationId,
    ts,
    anchor,
  );

  return {
    id: result.lastInsertRowId,
    text,
    due_at: dueAt,
    notification_id: notificationId,
    completed: 0,
    created_at: ts,
    anchor_event_id: anchor,
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
  patch: { text?: string; dueAt?: number },
): Promise<Reminder> {
  const db = await getDb();
  const existing = await getReminder(id);
  if (!existing) throw new Error(`Reminder ${id} not found`);

  const text = patch.text?.trim() || existing.text;
  const dueAt = patch.dueAt ?? existing.due_at;
  if (dueAt <= Date.now()) throw new Error('That time has already passed.');

  await cancelReminderNotification(existing.notification_id);
  const notificationId = await scheduleReminderNotification(text, dueAt);
  if (!notificationId) throw new Error('Cannot set a reminder without notification permission.');

  await db.runAsync(
    'UPDATE reminders SET text = ?, due_at = ?, notification_id = ?, completed = 0 WHERE id = ?',
    text,
    dueAt,
    notificationId,
    id,
  );
  const row = await getReminder(id);
  if (!row) throw new Error('Failed to update reminder');
  return row;
}

/** Moves reminders that were set for the end of an in-app event. */
export async function rescheduleAnchoredReminders(eventId: number, endAt: number): Promise<void> {
  if (endAt <= Date.now()) return;
  const db = await getDb();
  const rows = await db.getAllAsync<Reminder>(
    'SELECT * FROM reminders WHERE anchor_event_id = ? AND completed = 0',
    eventId,
  );
  for (const row of rows) {
    if (row.due_at === endAt) continue;
    await updateReminder(row.id, { dueAt: endAt });
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
