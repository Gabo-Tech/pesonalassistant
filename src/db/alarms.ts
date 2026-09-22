import { cancelAlarmNotification, scheduleAlarmNotification } from '../notify';
import { nextOccurrence, SNOOZE_MS, type AlarmRepeat } from '../llm/time';
import { getDb, now } from './index';

export type Alarm = {
  id: number;
  label: string;
  hour: number;
  minute: number;
  next_at: number;
  repeat: AlarmRepeat;
  enabled: number;
  notification_id: string | null;
  created_at: number;
};

export async function createAlarm(input: {
  label?: string;
  hour: number;
  minute: number;
  repeat: AlarmRepeat;
  nextAt?: number;
}): Promise<Alarm> {
  const nextAt = input.nextAt ?? nextOccurrence(input.hour, input.minute);
  if (nextAt <= Date.now()) {
    throw new Error('That time has already passed.');
  }

  const db = await getDb();
  const ts = now();
  const label = input.label?.trim() ?? '';

  const result = await db.runAsync(
    `INSERT INTO alarms (label, hour, minute, next_at, repeat, enabled, notification_id, created_at)
     VALUES (?, ?, ?, ?, ?, 1, NULL, ?)`,
    label,
    input.hour,
    input.minute,
    nextAt,
    input.repeat,
    ts,
  );
  const id = result.lastInsertRowId;

  const notificationId = await scheduleAlarmNotification({
    alarmId: id,
    label,
    hour: input.hour,
    minute: input.minute,
    dueAt: nextAt,
  });
  if (!notificationId) {
    await db.runAsync('DELETE FROM alarms WHERE id = ?', id);
    throw new Error('Cannot set an alarm without notification permission.');
  }

  await db.runAsync('UPDATE alarms SET notification_id = ? WHERE id = ?', notificationId, id);
  const row = await getAlarm(id);
  if (!row) throw new Error('Failed to save alarm');
  return row;
}

export async function getAlarm(id: number): Promise<Alarm | null> {
  const db = await getDb();
  return db.getFirstAsync<Alarm>('SELECT * FROM alarms WHERE id = ?', id);
}

export async function listAlarms(): Promise<Alarm[]> {
  const db = await getDb();
  return db.getAllAsync<Alarm>(
    'SELECT * FROM alarms WHERE enabled = 1 ORDER BY hour ASC, minute ASC',
  );
}

export async function updateAlarm(
  id: number,
  patch: { label?: string; hour?: number; minute?: number; repeat?: AlarmRepeat },
): Promise<Alarm> {
  const existing = await getAlarm(id);
  if (!existing) throw new Error(`Alarm ${id} not found`);

  const label = patch.label !== undefined ? patch.label.trim() : existing.label;
  const hour = patch.hour ?? existing.hour;
  const minute = patch.minute ?? existing.minute;
  const repeat = patch.repeat ?? existing.repeat;
  const nextAt = nextOccurrence(hour, minute);

  await cancelAlarmNotification(existing.notification_id);
  const notificationId = await scheduleAlarmNotification({
    alarmId: id,
    label,
    hour,
    minute,
    dueAt: nextAt,
  });
  if (!notificationId) throw new Error('Cannot set an alarm without notification permission.');

  const db = await getDb();
  await db.runAsync(
    `UPDATE alarms SET label = ?, hour = ?, minute = ?, next_at = ?, repeat = ?, notification_id = ?, enabled = 1
     WHERE id = ?`,
    label,
    hour,
    minute,
    nextAt,
    repeat,
    notificationId,
    id,
  );
  const row = await getAlarm(id);
  if (!row) throw new Error('Failed to update alarm');
  return row;
}

export async function cancelAlarm(id: number): Promise<void> {
  const db = await getDb();
  const row = await getAlarm(id);
  await cancelAlarmNotification(row?.notification_id ?? null);
  await db.runAsync('DELETE FROM alarms WHERE id = ?', id);
}

export async function snoozeAlarm(id: number, from = Date.now()): Promise<void> {
  const row = await getAlarm(id);
  if (!row || !row.enabled) return;

  await cancelAlarmNotification(row.notification_id);
  const nextAt = from + SNOOZE_MS;
  const notificationId = await scheduleAlarmNotification({
    alarmId: row.id,
    label: row.label,
    hour: row.hour,
    minute: row.minute,
    dueAt: nextAt,
  });

  const db = await getDb();
  await db.runAsync(
    'UPDATE alarms SET next_at = ?, notification_id = ? WHERE id = ?',
    nextAt,
    notificationId,
    id,
  );
}

export async function dismissAlarm(id: number, from = Date.now()): Promise<void> {
  const row = await getAlarm(id);
  if (!row) return;

  await cancelAlarmNotification(row.notification_id);

  if (row.repeat !== 'daily') {
    await cancelAlarm(id);
    return;
  }

  const nextAt = nextOccurrence(row.hour, row.minute, from);
  const notificationId = await scheduleAlarmNotification({
    alarmId: row.id,
    label: row.label,
    hour: row.hour,
    minute: row.minute,
    dueAt: nextAt,
  });

  const db = await getDb();
  await db.runAsync(
    'UPDATE alarms SET next_at = ?, notification_id = ? WHERE id = ?',
    nextAt,
    notificationId,
    id,
  );
}

/** Text used to uniquely match a spoken "cancel the 7am alarm". */
export function alarmSearchText(alarm: Alarm): string {
  const hour12 = alarm.hour % 12 || 12;
  const meridiem = alarm.hour >= 12 ? 'pm' : 'am';
  const mm = String(alarm.minute).padStart(2, '0');
  return [
    `${hour12}:${mm} ${meridiem}`,
    `${hour12}${meridiem}`,
    `${alarm.hour}:${mm}`,
    alarm.label,
    alarm.repeat,
  ]
    .filter(Boolean)
    .join(' ');
}
