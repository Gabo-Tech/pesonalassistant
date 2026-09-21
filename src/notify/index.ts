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

let prepared = false;

/**
 * Creates the Android channel and asks for permission.
 *
 * Order matters on Android 13+: the OS only shows the notification permission
 * prompt for apps that have at least one channel, so create the channel first.
 */
export async function prepareNotifications(): Promise<boolean> {
  if (prepared) return true;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#7C5CFF',
      sound: 'default',
    });
  }

  const current = await Notifications.getPermissionsAsync();
  const granted =
    current.granted || (await Notifications.requestPermissionsAsync()).granted;

  prepared = granted;
  return granted;
}

/** Schedules a one-shot local notification and returns its OS identifier. */
export async function scheduleReminderNotification(
  text: string,
  dueAt: number,
): Promise<string | null> {
  await prepareNotifications();

  // A past date would fire immediately (or be dropped); callers validate, we just guard.
  if (dueAt <= Date.now()) return null;

  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Reminder',
      body: text,
      sound: 'default',
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
