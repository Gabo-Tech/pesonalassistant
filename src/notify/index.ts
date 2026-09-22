import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { formatClockTime } from '../llm/time';

export const REMINDER_CHANNEL = 'reminders';
export const ALARM_CHANNEL = 'alarms';
export const ALARM_CATEGORY = 'alarms';
export const ALARM_DISMISS = 'alarm_dismiss';
export const ALARM_SNOOZE = 'alarm_snooze';

/**
 * Tells the OS what to do when a notification arrives while the app is open.
 * Must be registered at module scope (before any notification can land), which is
 * why this file is imported from the root layout.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let reminderChannelReady = false;
let alarmChannelReady = false;

/**
 * Creates the Android reminder channel with no permission prompt.
 * Android 13+ only shows the notification permission UI after a channel exists.
 */
export async function ensureReminderChannel(): Promise<void> {
  if (reminderChannelReady) return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#F4F1EA',
      // Leave `sound` unset: expo-notifications treats a string here as the name of a
      // bundled custom sound file, so 'default' would look for default.wav and warn.
    });
  }

  reminderChannelReady = true;
}

export async function ensureAlarmChannel(): Promise<void> {
  if (alarmChannelReady) return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ALARM_CHANNEL, {
      name: 'Alarms',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 400, 200, 400, 200, 400],
      lightColor: '#F4F1EA',
      enableVibrate: true,
      audioAttributes: { usage: Notifications.AndroidAudioUsage.ALARM },
    });
  }

  await Notifications.setNotificationCategoryAsync(ALARM_CATEGORY, [
    {
      identifier: ALARM_DISMISS,
      buttonTitle: 'Dismiss',
      options: { opensAppToForeground: true, isDestructive: true },
    },
    {
      identifier: ALARM_SNOOZE,
      buttonTitle: 'Snooze 10 min',
      options: { opensAppToForeground: true },
    },
  ]);

  alarmChannelReady = true;
}

/**
 * Ensures the channel exists, then asks for notification permission.
 * Call this when always-listen or a reminder actually needs it — not on cold start.
 */
export async function prepareNotifications(): Promise<boolean> {
  await ensureReminderChannel();
  await ensureAlarmChannel();

  const current = await Notifications.getPermissionsAsync();
  return current.granted || (await Notifications.requestPermissionsAsync()).granted;
}

/** Schedules a one-shot local notification and returns its OS identifier. */
export async function scheduleReminderNotification(
  text: string,
  dueAt: number,
): Promise<string | null> {
  const granted = await prepareNotifications();
  if (!granted) return null;

  // A past date would fire immediately (or be dropped); callers validate, we just guard.
  if (dueAt <= Date.now()) return null;

  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Reminder',
      body: text,
      ...(Platform.OS === 'android' ? { channelId: REMINDER_CHANNEL } : null),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(dueAt),
    },
  });
}

export async function scheduleAlarmNotification(input: {
  alarmId: number;
  label: string;
  hour: number;
  minute: number;
  dueAt: number;
}): Promise<string | null> {
  const granted = await prepareNotifications();
  if (!granted) return null;
  if (input.dueAt <= Date.now()) return null;

  const clock = formatClockTime(input.hour, input.minute);
  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Alarm',
      body: input.label.trim() || clock,
      sticky: true,
      categoryIdentifier: ALARM_CATEGORY,
      data: { kind: 'alarm', alarmId: String(input.alarmId) },
      ...(Platform.OS === 'android'
        ? { channelId: ALARM_CHANNEL, priority: Notifications.AndroidNotificationPriority.MAX }
        : null),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(input.dueAt),
    },
  });
}

export async function cancelReminderNotification(id: string | null): Promise<void> {
  await cancelScheduled(id);
}

export async function cancelAlarmNotification(id: string | null): Promise<void> {
  await cancelScheduled(id);
}

async function cancelScheduled(id: string | null): Promise<void> {
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // Already fired or already cancelled - nothing to undo.
  }
  try {
    await Notifications.dismissNotificationAsync(id);
  } catch {
    // Not currently displayed.
  }
}
