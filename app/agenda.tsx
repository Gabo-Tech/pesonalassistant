import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import {
  createEvent,
  deleteEvent,
  ensureCalendarPermission,
  listEvents,
  updateEvent,
  type SimpleEvent,
} from '../src/calendar/events';
import { EVENT_HORIZONS, horizonRange, type EventHorizonId } from '../src/calendar/range';
import { cancelAlarm, createAlarm, listAlarms, updateAlarm, type Alarm } from '../src/db/alarms';
import {
  createLocalEvent,
  deleteLocalEvent,
  listLocalEvents,
  updateLocalEvent,
} from '../src/db/localEvents';
import {
  completeReminder,
  createReminder,
  deleteReminder,
  listReminders,
  updateReminder,
  type Reminder,
} from '../src/db/reminders';
import { useT } from '../src/i18n';
import { localeTag } from '../src/i18n/wake';
import { formatClockTime, formatWhen, nextOccurrence, parseWhen } from '../src/llm/time';
import { useSettings } from '../src/settings/store';
import { Bento, Chip, GUTTER, InkSwitch, PAGE_MARGIN } from '../src/ui/Bento';
import { KeyboardGutter } from '../src/ui/KeyboardGutter';
import { useTheme } from '../src/ui/ThemeProvider';
import { Body, Display, Meta } from '../src/ui/Type';

type AlarmDraft = { id?: number; time: string; label: string; daily: boolean };
type ReminderDraft = { id?: number; text: string; when: string; originalAt?: number };
type EventDraft = { id?: string; title: string; when: string; minutes: string; location: string; originalAt?: number };

export default function AgendaScreen() {
  const t = useTheme();
  const tr = useT();
  const [settings] = useSettings();
  const loc = localeTag(settings.locale);
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [events, setEvents] = useState<SimpleEvent[]>([]);
  const [calendarDenied, setCalendarDenied] = useState(false);
  const [horizon, setHorizon] = useState<EventHorizonId>('7d');
  const [alarmDraft, setAlarmDraft] = useState<AlarmDraft | null>(null);
  const [reminderDraft, setReminderDraft] = useState<ReminderDraft | null>(null);
  const [eventDraft, setEventDraft] = useState<EventDraft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setAlarms(await listAlarms());
    setReminders(await listReminders());
    const range = horizonRange(horizon);

    if (settings.calendarMode !== 'phone') {
      setCalendarDenied(false);
      const rows = await listLocalEvents(range.from, range.to);
      setEvents(
        rows.map((row) => ({
          id: String(row.id),
          title: row.title,
          start: row.start_at,
          end: row.end_at,
          allDay: row.all_day === 1,
          location: row.location || undefined,
        })),
      );
      return;
    }

    const granted = await ensureCalendarPermission();
    setCalendarDenied(!granted);
    if (!granted) {
      setEvents([]);
      return;
    }

    setEvents(await listEvents(range.from, range.to));
  }, [horizon, settings.calendarMode]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const saveAlarm = async () => {
    if (!alarmDraft) return;
    const when = parseWhen(alarmDraft.time);
    if (!when) {
      setFormError(tr('agenda.invalidClock'));
      return;
    }
    const at = new Date(when.at);
    const hour = at.getHours();
    const minute = at.getMinutes();
    const repeat = alarmDraft.daily ? 'daily' : 'once';
    if (alarmDraft.id) {
      await updateAlarm(alarmDraft.id, { label: alarmDraft.label, hour, minute, repeat });
    } else {
      await createAlarm({
        label: alarmDraft.label,
        hour,
        minute,
        repeat,
        nextAt: nextOccurrence(hour, minute),
      });
    }
    setAlarmDraft(null);
    setFormError(null);
    await refresh();
  };

  const saveReminder = async () => {
    if (!reminderDraft) return;
    const when = parseWhen(reminderDraft.when);
    const dueAt = when?.at ?? reminderDraft.originalAt;
    if (!dueAt) {
      setFormError(tr('agenda.invalidWhen'));
      return;
    }
    if (reminderDraft.id) {
      await updateReminder(reminderDraft.id, { text: reminderDraft.text, dueAt });
    } else {
      await createReminder(reminderDraft.text.trim(), dueAt);
    }
    setReminderDraft(null);
    setFormError(null);
    await refresh();
  };

  const saveEvent = async () => {
    if (!eventDraft) return;
    const when = parseWhen(eventDraft.when);
    const start = when?.at ?? eventDraft.originalAt;
    if (!start) {
      setFormError(tr('agenda.invalidWhen'));
      return;
    }
    const minutes = Number(eventDraft.minutes) || 60;
    const title = eventDraft.title.trim();
    if (!title) return;
    const end = start + minutes * 60_000;
    const location = eventDraft.location.trim();
    if (settings.calendarMode !== 'phone') {
      if (eventDraft.id) {
        await updateLocalEvent(Number(eventDraft.id), { title, start, end, location });
      } else {
        await createLocalEvent({ title, start, end, location });
      }
    } else if (eventDraft.id) {
      await updateEvent(eventDraft.id, {
        title,
        start,
        end,
        location: location || undefined,
      });
    } else {
      await createEvent({
        title,
        start,
        end,
        location: location || undefined,
      });
    }
    setEventDraft(null);
    setFormError(null);
    await refresh();
  };

  return (
    <KeyboardGutter style={{ backgroundColor: t.bg }}>
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={styles.content}
    >
      {formError ? <Meta style={{ width: '100%' }}>{formError}</Meta> : null}

      <SectionHead
        title={tr('agenda.alarms')}
        action={tr('agenda.addAlarm')}
        onPress={() => {
          setAlarmDraft({ time: '7:00', label: '', daily: false });
          setFormError(null);
        }}
      />
      {alarmDraft && (
        <Bento span={2} style={{ gap: 10 }}>
          <Meta>{alarmDraft.id ? tr('agenda.editAlarm') : tr('agenda.addAlarm')}</Meta>
          <Field
            label={tr('agenda.time')}
            value={alarmDraft.time}
            onChange={(time) => setAlarmDraft({ ...alarmDraft, time })}
            placeholder="7:30"
          />
          <Field
            label={tr('agenda.label')}
            value={alarmDraft.label}
            onChange={(label) => setAlarmDraft({ ...alarmDraft, label })}
          />
          <View style={styles.row}>
            <Body style={{ flex: 1 }}>{tr('agenda.daily')}</Body>
            <InkSwitch
              value={alarmDraft.daily}
              onValueChange={(daily) => setAlarmDraft({ ...alarmDraft, daily })}
            />
          </View>
          <FormActions onSave={() => void saveAlarm()} onCancel={() => setAlarmDraft(null)} />
        </Bento>
      )}
      {alarms.length === 0 && !alarmDraft && (
        <Bento span={2}>
          <Meta>{tr('agenda.noneAlarms')}</Meta>
        </Bento>
      )}
      {alarms.map((alarm) => (
        <Bento key={alarm.id} span={2} style={styles.row}>
          <Pressable
            style={{ flex: 1, gap: 6 }}
            onPress={() =>
              setAlarmDraft({
                id: alarm.id,
                time: `${String(alarm.hour).padStart(2, '0')}:${String(alarm.minute).padStart(2, '0')}`,
                label: alarm.label,
                daily: alarm.repeat === 'daily',
              })
            }
          >
            <Body>{formatClockTime(alarm.hour, alarm.minute, loc)}</Body>
            <Meta>
              {alarm.repeat === 'daily' ? tr('agenda.daily') : formatWhen(alarm.next_at, loc)}
              {alarm.label ? ` — ${alarm.label}` : ''}
            </Meta>
          </Pressable>
          <Pressable
            onPress={() => {
              Alert.alert(tr('common.delete'), tr('agenda.deleteAlarm'), [
                { text: tr('common.cancel'), style: 'cancel' },
                {
                  text: tr('common.delete'),
                  style: 'destructive',
                  onPress: () => void cancelAlarm(alarm.id).then(refresh),
                },
              ]);
            }}
            hitSlop={10}
          >
            <Meta style={{ color: t.ink }}>{tr('common.delete')}</Meta>
          </Pressable>
        </Bento>
      ))}

      <SectionHead
        title={tr('agenda.reminders')}
        action={tr('agenda.addReminder')}
        onPress={() => {
          setReminderDraft({ text: '', when: '' });
          setFormError(null);
        }}
      />
      {reminderDraft && (
        <Bento span={2} style={{ gap: 10 }}>
          <Meta>{reminderDraft.id ? tr('agenda.editReminder') : tr('agenda.addReminder')}</Meta>
          <Field
            label={tr('agenda.text')}
            value={reminderDraft.text}
            onChange={(text) => setReminderDraft({ ...reminderDraft, text })}
          />
          <Field
            label={tr('agenda.when')}
            value={reminderDraft.when}
            onChange={(when) => setReminderDraft({ ...reminderDraft, when })}
            placeholder={tr('agenda.whenHint')}
          />
          <FormActions onSave={() => void saveReminder()} onCancel={() => setReminderDraft(null)} />
        </Bento>
      )}
      {reminders.length === 0 && !reminderDraft && (
        <Bento span={2}>
          <Meta>{tr('agenda.noneReminders')}</Meta>
        </Bento>
      )}
      {reminders.map((reminder) => (
        <Bento key={reminder.id} span={2} style={styles.row}>
          <Pressable
            style={{ flex: 1, gap: 6 }}
            onPress={() =>
              setReminderDraft({
                id: reminder.id,
                text: reminder.text,
                when: formatWhen(reminder.due_at, loc),
                originalAt: reminder.due_at,
              })
            }
          >
            <Body>{reminder.text}</Body>
            <Meta>{formatWhen(reminder.due_at, loc)}</Meta>
          </Pressable>
          <Pressable
            onPress={() => void completeReminder(reminder.id).then(refresh)}
            hitSlop={10}
            style={{ justifyContent: 'center' }}
          >
            <Meta style={{ color: t.ink }}>{tr('common.done')}</Meta>
          </Pressable>
          <Pressable
            onPress={() => {
              Alert.alert(tr('common.delete'), tr('agenda.deleteReminder'), [
                { text: tr('common.cancel'), style: 'cancel' },
                {
                  text: tr('common.delete'),
                  style: 'destructive',
                  onPress: () => void deleteReminder(reminder.id).then(refresh),
                },
              ]);
            }}
            hitSlop={10}
          >
            <Meta>{tr('common.delete')}</Meta>
          </Pressable>
        </Bento>
      ))}

      <Display style={{ fontSize: 28, marginTop: 12, marginBottom: 4, width: '100%' }}>
        {tr('agenda.events')}
      </Display>
      <View style={styles.chips}>
        {EVENT_HORIZONS.map((item) => (
          <Chip
            key={item.id}
            label={tr(item.labelKey)}
            active={horizon === item.id}
            onPress={() => setHorizon(item.id)}
          />
        ))}
      </View>
      <Pressable
        onPress={() => {
          setEventDraft({ title: '', when: '', minutes: '60', location: '' });
          setFormError(null);
        }}
        style={{ width: '100%' }}
      >
        <Meta style={{ color: t.ink }}>{tr('agenda.addEvent')}</Meta>
      </Pressable>
      {eventDraft && (
        <Bento span={2} style={{ gap: 10 }}>
          <Meta>{eventDraft.id ? tr('agenda.editEvent') : tr('agenda.addEvent')}</Meta>
          <Field
            label={tr('agenda.title')}
            value={eventDraft.title}
            onChange={(title) => setEventDraft({ ...eventDraft, title })}
          />
          <Field
            label={tr('agenda.when')}
            value={eventDraft.when}
            onChange={(when) => setEventDraft({ ...eventDraft, when })}
            placeholder={tr('agenda.whenHint')}
          />
          <Field
            label={tr('agenda.duration')}
            value={eventDraft.minutes}
            onChange={(minutes) => setEventDraft({ ...eventDraft, minutes })}
            placeholder="60"
          />
          <Field
            label={tr('agenda.location')}
            value={eventDraft.location}
            onChange={(location) => setEventDraft({ ...eventDraft, location })}
          />
          <FormActions onSave={() => void saveEvent()} onCancel={() => setEventDraft(null)} />
        </Bento>
      )}
      {calendarDenied && (
        <Bento span={2}>
          <Body>{tr('agenda.calendarDenied')}</Body>
        </Bento>
      )}
      {!calendarDenied && events.length === 0 && !eventDraft && (
        <Bento span={2}>
          <Meta>{tr('agenda.noneEvents')}</Meta>
        </Bento>
      )}
      {events.map((event) => (
        <Bento key={event.id} span={2} style={styles.row}>
          <Pressable
            style={{ flex: 1, gap: 6 }}
            onPress={() =>
              setEventDraft({
                id: event.id,
                title: event.title,
                when: formatWhen(event.start, loc),
                minutes: String(Math.max(15, Math.round((event.end - event.start) / 60_000))),
                location: event.location ?? '',
                originalAt: event.start,
              })
            }
          >
            <Body>{event.title}</Body>
            <Meta>
              {event.allDay ? tr('agenda.allDay') : formatWhen(event.start, loc)}
              {event.location ? ` — ${event.location}` : ''}
            </Meta>
          </Pressable>
          <Pressable
            onPress={() => {
              Alert.alert(tr('common.delete'), tr('agenda.deleteEvent'), [
                { text: tr('common.cancel'), style: 'cancel' },
                {
                  text: tr('common.delete'),
                  style: 'destructive',
                  onPress: () => {
                    const remove =
                      settings.calendarMode === 'phone'
                        ? deleteEvent(event.id)
                        : deleteLocalEvent(Number(event.id));
                    void remove.then(refresh);
                  },
                },
              ]);
            }}
            hitSlop={10}
          >
            <Meta>{tr('common.delete')}</Meta>
          </Pressable>
        </Bento>
      ))}
    </ScrollView>
    </KeyboardGutter>
  );
}

function SectionHead({
  title,
  action,
  onPress,
}: {
  title: string;
  action: string;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <View style={styles.sectionHead}>
      <Display style={{ fontSize: 28 }}>{title}</Display>
      <Pressable onPress={onPress} hitSlop={8}>
        <Meta style={{ color: t.ink }}>{action}</Meta>
      </Pressable>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Meta>{label}</Meta>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.dim}
        style={[styles.input, { color: t.ink, borderColor: t.line, borderRadius: t.radiusChip }]}
      />
    </View>
  );
}

function FormActions({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  const t = useTheme();
  const tr = useT();
  return (
    <View style={styles.row}>
      <Pressable onPress={onCancel} style={{ flex: 1, paddingVertical: 10 }}>
        <Meta>{tr('common.cancel')}</Meta>
      </Pressable>
      <Pressable
        onPress={onSave}
        style={{
          flex: 1,
          backgroundColor: t.inverse,
          borderRadius: t.radiusChip,
          paddingVertical: 12,
          alignItems: 'center',
        }}
      >
        <Meta style={{ color: t.inverseInk }}>{tr('common.save')}</Meta>
      </Pressable>
    </View>
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%' },
  sectionHead: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
});
