import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const REMINDER_CHANNEL = 'reminders';

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

let channelReady = false;

/**
 * Creates the Android reminder channel with no permission prompt.
 * Android 13+ only shows the notification permission UI after a channel exists.
 */
export async function ensureReminderChannel(): Promise<void> {
  if (channelReady) return;

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

  channelReady = true;
}

/**
 * Ensures the channel exists, then asks for notification permission.
 * Call this when always-listen or a reminder actually needs it — not on cold start.
 */
export async function prepareNotifications(): Promise<boolean> {
  await ensureReminderChannel();

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

export async function cancelReminderNotification(id: string | null): Promise<void> {
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // Already fired or already cancelled - nothing to undo.
  }
}
