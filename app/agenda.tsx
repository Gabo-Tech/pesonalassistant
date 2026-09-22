import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ensureCalendarPermission, listEvents, type SimpleEvent } from '../src/calendar/events';
import { cancelAlarm, listAlarms, type Alarm } from '../src/db/alarms';
import { completeReminder, listReminders, type Reminder } from '../src/db/reminders';
import { formatClockTime, formatWhen } from '../src/llm/time';
import { Bento, GUTTER, PAGE_MARGIN } from '../src/ui/Bento';
import { useTheme } from '../src/ui/ThemeProvider';
import { Body, Display, Meta } from '../src/ui/Type';

export default function AgendaScreen() {
  const t = useTheme();
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [events, setEvents] = useState<SimpleEvent[]>([]);
  const [calendarDenied, setCalendarDenied] = useState(false);

  const refresh = useCallback(async () => {
    setAlarms(await listAlarms());
    setReminders(await listReminders());

    const granted = await ensureCalendarPermission();
    setCalendarDenied(!granted);
    if (!granted) {
      setEvents([]);
      return;
    }

    const now = Date.now();
    setEvents(await listEvents(now, now + 7 * 86_400_000));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={styles.content}
    >
      <Display style={{ fontSize: 28, marginBottom: 4, width: '100%' }}>Alarms</Display>
      {alarms.length === 0 && (
        <Bento span={2}>
          <Meta>None set</Meta>
        </Bento>
      )}
      {alarms.map((alarm) => (
        <Bento key={alarm.id} span={2} style={styles.row}>
          <View style={{ flex: 1, gap: 6 }}>
            <Body>{formatClockTime(alarm.hour, alarm.minute)}</Body>
            <Meta>
              {alarm.repeat === 'daily' ? 'Daily' : formatWhen(alarm.next_at)}
              {alarm.label ? ` — ${alarm.label}` : ''}
            </Meta>
          </View>
          <Pressable
            onPress={async () => {
              await cancelAlarm(alarm.id);
              await refresh();
            }}
            hitSlop={10}
            style={{ justifyContent: 'center' }}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${formatClockTime(alarm.hour, alarm.minute)} alarm`}
          >
            <Meta style={{ color: t.ink }}>Delete</Meta>
          </Pressable>
        </Bento>
      ))}

      <Display style={{ fontSize: 28, marginTop: 12, marginBottom: 4, width: '100%' }}>
        Reminders
      </Display>
      {reminders.length === 0 && (
        <Bento span={2}>
          <Meta>Nothing pending</Meta>
        </Bento>
      )}
      {reminders.map((reminder) => (
        <Bento key={reminder.id} span={2} style={styles.row}>
          <View style={{ flex: 1, gap: 6 }}>
            <Body>{reminder.text}</Body>
            <Meta>{formatWhen(reminder.due_at)}</Meta>
          </View>
          <Pressable
            onPress={async () => {
              await completeReminder(reminder.id);
              await refresh();
            }}
            hitSlop={10}
            style={{ justifyContent: 'center' }}
          >
            <Meta style={{ color: t.ink }}>Done</Meta>
          </Pressable>
        </Bento>
      ))}

      <Display style={{ fontSize: 28, marginTop: 12, marginBottom: 4, width: '100%' }}>
        Next 7 days
      </Display>
      {calendarDenied && (
        <Bento span={2}>
          <Body>Calendar permission denied, so events cannot be shown.</Body>
        </Bento>
      )}
      {!calendarDenied && events.length === 0 && (
        <Bento span={2}>
          <Meta>No events</Meta>
        </Bento>
      )}
      {events.map((event) => (
        <Bento key={event.id} span={2} style={{ gap: 6 }}>
          <Body>{event.title}</Body>
          <Meta>
            {event.allDay ? 'All day' : formatWhen(event.start)}
            {event.location ? ` — ${event.location}` : ''}
          </Meta>
        </Bento>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: PAGE_MARGIN,
    gap: GUTTER,
    paddingBottom: 40,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
