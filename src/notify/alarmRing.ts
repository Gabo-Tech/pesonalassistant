import * as Notifications from 'expo-notifications';
import { dismissAlarm, getAlarm, snoozeAlarm, type Alarm } from '../db/alarms';
import { rollReminderForward } from '../db/reminders';
import { formatClockTime } from '../llm/time';
import { speak, stopSpeaking } from '../voice/tts';
import {
  ALARM_DISMISS,
  ALARM_SNOOZE,
} from './index';

export type RingingAlarm = {
  id: number;
  label: string;
  hour: number;
  minute: number;
  repeat: Alarm['repeat'];
};

type Listener = (ringing: RingingAlarm | null) => void;

const listeners = new Set<Listener>();
let ringing: RingingAlarm | null = null;
let started = false;

function publish(next: RingingAlarm | null): void {
  ringing = next;
  listeners.forEach((fn) => fn(ringing));
}

export function subscribeAlarmRing(fn: Listener): () => void {
  listeners.add(fn);
  fn(ringing);
  return () => listeners.delete(fn);
}

export const getRingingAlarm = (): RingingAlarm | null => ringing;

function alarmIdFromData(data: Record<string, unknown> | undefined): number | null {
  if (!data || data.kind !== 'alarm') return null;
  const raw = data.alarmId;
  const id = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(id) ? id : null;
}

export async function presentAlarm(id: number): Promise<void> {
  const row = await getAlarm(id);
  if (!row || !row.enabled) return;
  publish({
    id: row.id,
    label: row.label,
    hour: row.hour,
    minute: row.minute,
    repeat: row.repeat,
  });
  speak(`Alarm. ${row.label.trim() || formatClockTime(row.hour, row.minute)}.`);
}

export async function handleAlarmDismiss(): Promise<void> {
  const current = ringing;
  publish(null);
  stopSpeaking();
  if (current) await dismissAlarm(current.id);
}

export async function handleAlarmSnooze(): Promise<void> {
  const current = ringing;
  publish(null);
  stopSpeaking();
  if (current) await snoozeAlarm(current.id);
}

function reminderIdFromData(data: Record<string, unknown> | undefined): number | null {
  if (!data || data.kind !== 'reminder') return null;
  const raw = data.reminderId;
  const id = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(id) ? id : null;
}

function onNotification(notification: Notifications.Notification): void {
  const data = notification.request.content.data as Record<string, unknown>;
  const reminderId = reminderIdFromData(data);
  if (reminderId != null) {
    void rollReminderForward(reminderId);
    return;
  }
  const id = alarmIdFromData(data);
  if (id == null) return;
  void presentAlarm(id);
}

function onResponse(response: Notifications.NotificationResponse): void {
  const data = response.notification.request.content.data as Record<string, unknown>;
  const reminderId = reminderIdFromData(data);
  if (reminderId != null) {
    void rollReminderForward(reminderId);
    return;
  }
  const id = alarmIdFromData(data);
  if (id == null) return;

  if (response.actionIdentifier === ALARM_DISMISS) {
    publish(null);
    stopSpeaking();
    void dismissAlarm(id);
    return;
  }
  if (response.actionIdentifier === ALARM_SNOOZE) {
    publish(null);
    stopSpeaking();
    void snoozeAlarm(id);
    return;
  }
  void presentAlarm(id);
}

/** Call once after the database is open. */
export function startAlarmListeners(): void {
  if (started) return;
  started = true;

  Notifications.addNotificationReceivedListener(onNotification);
  Notifications.addNotificationResponseReceivedListener(onResponse);

  void Notifications.getLastNotificationResponseAsync().then((response) => {
    if (!response) return;
    onResponse(response);
    Notifications.clearLastNotificationResponse();
  });
}
