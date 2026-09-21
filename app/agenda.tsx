import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ensureCalendarPermission, listEvents, type SimpleEvent } from '../src/calendar/events';
import { completeReminder, listReminders, type Reminder } from '../src/db/reminders';
import { formatWhen } from '../src/llm/time';
import { theme } from '../src/ui/theme';

export default function AgendaScreen() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [events, setEvents] = useState<SimpleEvent[]>([]);
  const [calendarDenied, setCalendarDenied] = useState(false);

  const refresh = useCallback(async () => {
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
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Reminders</Text>
      {reminders.length === 0 && <Text style={styles.empty}>Nothing pending.</Text>}
      {reminders.map((reminder) => (
        <View key={reminder.id} style={styles.row}>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>{reminder.text}</Text>
            <Text style={styles.rowMeta}>{formatWhen(reminder.due_at)}</Text>
          </View>
          <Pressable
            onPress={async () => {
              await completeReminder(reminder.id);
              await refresh();
            }}
            hitSlop={10}
          >
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>
      ))}

      <Text style={[styles.heading, styles.headingSpaced]}>Next 7 days</Text>
      {calendarDenied && (
        <Text style={styles.empty}>
          Calendar permission denied, so events cannot be shown.
        </Text>
      )}
      {!calendarDenied && events.length === 0 && (
        <Text style={styles.empty}>No events.</Text>
      )}
      {events.map((event) => (
        <View key={event.id} style={styles.row}>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>{event.title}</Text>
            <Text style={styles.rowMeta}>
              {event.allDay ? 'All day' : formatWhen(event.start)}
              {event.location ? ` - ${event.location}` : ''}
            </Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  heading: { color: theme.text, fontSize: 18, fontWeight: '700' },
  headingSpaced: { marginTop: 18 },
  empty: { color: theme.textDim, fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    padding: 14,
  },
  rowBody: { flex: 1, gap: 3 },
  rowTitle: { color: theme.text, fontSize: 15, fontWeight: '600' },
  rowMeta: { color: theme.textDim, fontSize: 12 },
  done: { color: theme.good, fontSize: 13, fontWeight: '600' },
});
