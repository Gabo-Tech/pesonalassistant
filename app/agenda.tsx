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
import { buildBrief, weekBounds } from '../src/agenda/brief';
import { cancelAlarm, createAlarm, listAlarms, updateAlarm, type Alarm } from '../src/db/alarms';
import {
  completeTask,
  createTask,
  deleteTask,
  listTasks,
  updateTask,
  type Task,
} from '../src/db/tasks';
import {
  createLocalEvent,
  deleteLocalEvent,
  listOccurrences,
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
type ReminderDraft = {
  id?: number;
  text: string;
  when: string;
  originalAt?: number;
  repeat: 'once' | 'daily' | 'weekly';
};
type TaskDraft = {
  id?: number;
  title: string;
  notes: string;
  when: string;
  important: boolean;
  originalDue?: number | null;
};
type ShownEvent = SimpleEvent & {
  repeat: 'none' | 'daily' | 'weekly' | 'monthly';
  alert: number | null;
};
type EventDraft = {
  id?: string;
  title: string;
  when: string;
  minutes: string;
  location: string;
  originalAt?: number;
  allDay: boolean;
  repeat: 'none' | 'daily' | 'weekly' | 'monthly';
  alert: number | null;
};

export default function AgendaScreen() {
  const t = useTheme();
  const tr = useT();
  const [settings] = useSettings();
  const loc = localeTag(settings.locale);
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [events, setEvents] = useState<ShownEvent[]>([]);
  const [weekText, setWeekText] = useState('');
  const [calendarDenied, setCalendarDenied] = useState(false);
  const [horizon, setHorizon] = useState<EventHorizonId>('7d');
  const [alarmDraft, setAlarmDraft] = useState<AlarmDraft | null>(null);
  const [taskDraft, setTaskDraft] = useState<TaskDraft | null>(null);
  const [reminderDraft, setReminderDraft] = useState<ReminderDraft | null>(null);
  const [eventDraft, setEventDraft] = useState<EventDraft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [alarmRows, reminderRows, taskRows] = await Promise.all([
      listAlarms(),
      listReminders(),
      listTasks('open'),
    ]);
    setAlarms(alarmRows);
    setReminders(reminderRows);
    setTasks(taskRows);

    const now = Date.now();
    const week = weekBounds(now, 'this');
    const range = horizonRange(horizon);

    let horizonEvents: ShownEvent[] = [];
    let weekEvents: { title: string; start: number }[] = [];
    if (settings.calendarMode !== 'phone') {
      setCalendarDenied(false);
      const [horizonRows, weekRows] = await Promise.all([
        listOccurrences(range.from, range.to),
        listOccurrences(week.from, week.to),
      ]);
      horizonEvents = horizonRows.map((row) => ({
        id: String(row.id),
        title: row.title,
        start: row.occurrenceStart,
        end: row.occurrenceEnd,
        allDay: row.allDay,
        location: row.location || undefined,
        repeat: row.repeat,
        alert: row.alertMinutes ?? null,
      }));
      weekEvents = weekRows.map((row) => ({ title: row.title, start: row.occurrenceStart }));
    } else {
      const granted = await ensureCalendarPermission();
      setCalendarDenied(!granted);
      if (granted) {
        const [horizonRows, weekRows] = await Promise.all([
          listEvents(range.from, range.to),
          listEvents(week.from, week.to),
        ]);
        horizonEvents = horizonRows.map((row) => ({
          ...row,
          repeat: 'none',
          alert: null,
        }));
        weekEvents = weekRows.map((row) => ({ title: row.title, start: row.start }));
      }
    }

    setEvents(horizonEvents);
    setWeekText(
      buildBrief({
        now,
        span: 'this week',
        from: week.from,
        to: week.to,
        locale: settings.locale,
        events: weekEvents,
        reminders: reminderRows.map((row) => ({ text: row.text, dueAt: row.due_at })),
        tasks: taskRows.map((row) => ({ title: row.title, dueAt: row.due_at, status: row.status })),
      }),
    );
  }, [horizon, settings.calendarMode, settings.locale]);

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
      await updateReminder(reminderDraft.id, { text: reminderDraft.text, dueAt, repeat: reminderDraft.repeat });
    } else {
      await createReminder(reminderDraft.text.trim(), dueAt, null, reminderDraft.repeat);
    }
    setReminderDraft(null);
    setFormError(null);
    await refresh();
  };

  const saveTask = async () => {
    if (!taskDraft) return;
    const title = taskDraft.title.trim();
    if (!title) return;
    const trimmed = taskDraft.when.trim();
    let dueAt: number | null = null;
    if (trimmed) {
      const when = parseWhen(trimmed);
      dueAt = when?.at ?? taskDraft.originalDue ?? null;
      if (!dueAt) {
        setFormError(tr('agenda.invalidWhen'));
        return;
      }
    }
    const patch = {
      title,
      notes: taskDraft.notes,
      dueAt,
      priority: taskDraft.important ? 1 : 0,
    };
    if (taskDraft.id) await updateTask(taskDraft.id, patch);
    else await createTask(patch);
    setTaskDraft(null);
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
    let end = start + minutes * 60_000;
    let begin = start;
    if (eventDraft.allDay) {
      const day = new Date(start);
      day.setHours(0, 0, 0, 0);
      begin = day.getTime();
      end = begin + 86_400_000;
    }
    const location = eventDraft.location.trim();
    if (settings.calendarMode !== 'phone') {
      const patch = {
        title,
        start: begin,
        end,
        location,
        allDay: eventDraft.allDay,
        repeat: eventDraft.repeat,
        alertMinutes: eventDraft.alert,
      };
      if (eventDraft.id) await updateLocalEvent(Number(eventDraft.id), patch);
      else await createLocalEvent(patch);
    } else if (eventDraft.id) {
      await updateEvent(eventDraft.id, {
        title,
        start: begin,
        end,
        location: location || undefined,
      });
    } else {
      await createEvent({
        title,
        start: begin,
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

      <Bento span={2} style={{ gap: 8 }}>
        <Meta>{tr('agenda.thisWeek')}</Meta>
        <Body>{weekText}</Body>
      </Bento>

      <SectionHead
        title={tr('agenda.tasks')}
        action={tr('agenda.addTask')}
        onPress={() => {
          setTaskDraft({ title: '', notes: '', when: '', important: false });
          setFormError(null);
        }}
      />
      {taskDraft && (
        <Bento span={2} style={{ gap: 10 }}>
          <Meta>{taskDraft.id ? tr('agenda.editTask') : tr('agenda.addTask')}</Meta>
          <Field
            label={tr('agenda.title')}
            value={taskDraft.title}
            onChange={(title) => setTaskDraft({ ...taskDraft, title })}
          />
          <Field
            label={tr('agenda.notes')}
            value={taskDraft.notes}
            onChange={(notes) => setTaskDraft({ ...taskDraft, notes })}
          />
          <Field
            label={tr('agenda.due')}
            value={taskDraft.when}
            onChange={(when) => setTaskDraft({ ...taskDraft, when })}
            placeholder={tr('agenda.whenHint')}
          />
          <View style={styles.row}>
            <Body style={{ flex: 1 }}>{tr('agenda.important')}</Body>
            <InkSwitch
              value={taskDraft.important}
              onValueChange={(important) => setTaskDraft({ ...taskDraft, important })}
            />
          </View>
          <FormActions onSave={() => void saveTask()} onCancel={() => setTaskDraft(null)} />
        </Bento>
      )}
      {tasks.length === 0 && !taskDraft && (
        <Bento span={2}>
          <Meta>{tr('agenda.noneTasks')}</Meta>
        </Bento>
      )}
      {tasks.map((task) => (
        <Bento key={task.id} span={2} style={styles.row}>
          <Pressable
            style={{ flex: 1, gap: 6 }}
            onPress={() =>
              setTaskDraft({
                id: task.id,
                title: task.title,
                notes: task.notes,
                when: task.due_at ? formatWhen(task.due_at, loc) : '',
                important: task.priority === 1,
                originalDue: task.due_at,
              })
            }
          >
            <Body>{task.title}</Body>
            <Meta>
              {task.priority === 1 ? `${tr('agenda.important')} · ` : ''}
              {task.due_at ? formatWhen(task.due_at, loc) : task.notes}
            </Meta>
          </Pressable>
          <Pressable
            onPress={() => void completeTask(task.id).then(refresh)}
            hitSlop={10}
            style={{ justifyContent: 'center' }}
          >
            <Meta style={{ color: t.ink }}>{tr('common.done')}</Meta>
          </Pressable>
          <Pressable
            onPress={() => {
              Alert.alert(tr('common.delete'), tr('agenda.deleteTask'), [
                { text: tr('common.cancel'), style: 'cancel' },
                {
                  text: tr('common.delete'),
                  style: 'destructive',
                  onPress: () => void deleteTask(task.id).then(refresh),
                },
              ]);
            }}
            hitSlop={10}
          >
            <Meta>{tr('common.delete')}</Meta>
          </Pressable>
        </Bento>
      ))}

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
          setReminderDraft({ text: '', when: '', repeat: 'once' });
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
          <View style={styles.chips}>
            {(['once', 'daily', 'weekly'] as const).map((repeat) => (
              <Chip
                key={repeat}
                label={tr(
                  repeat === 'once'
                    ? 'agenda.once'
                    : repeat === 'daily'
                      ? 'agenda.daily'
                      : 'agenda.weekly',
                )}
                active={reminderDraft.repeat === repeat}
                onPress={() => setReminderDraft({ ...reminderDraft, repeat })}
              />
            ))}
          </View>
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
                repeat: reminder.repeat === 'daily' || reminder.repeat === 'weekly' ? reminder.repeat : 'once',
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
          setEventDraft({ title: '', when: '', minutes: '60', location: '', allDay: false, repeat: 'none', alert: null });
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
          {settings.calendarMode !== 'phone' ? (
            <>
              <View style={styles.row}>
                <Body style={{ flex: 1 }}>{tr('agenda.allDay')}</Body>
                <InkSwitch
                  value={eventDraft.allDay}
                  onValueChange={(allDay) => setEventDraft({ ...eventDraft, allDay })}
                />
              </View>
              <View style={styles.chips}>
                {(['none', 'daily', 'weekly', 'monthly'] as const).map((repeat) => (
                  <Chip
                    key={repeat}
                    label={tr(
                      repeat === 'none'
                        ? 'agenda.once'
                        : repeat === 'daily'
                          ? 'agenda.daily'
                          : repeat === 'weekly'
                            ? 'agenda.weekly'
                            : 'agenda.monthly',
                    )}
                    active={eventDraft.repeat === repeat}
                    onPress={() => setEventDraft({ ...eventDraft, repeat })}
                  />
                ))}
              </View>
              <View style={styles.chips}>
                {[
                  { minutes: null, key: 'agenda.alertNone' as const },
                  { minutes: 10, key: 'agenda.alert10' as const },
                  { minutes: 60, key: 'agenda.alertHour' as const },
                  { minutes: 1440, key: 'agenda.alertDay' as const },
                ].map((option) => (
                  <Chip
                    key={option.key}
                    label={tr(option.key)}
                    active={eventDraft.alert === option.minutes}
                    onPress={() => setEventDraft({ ...eventDraft, alert: option.minutes })}
                  />
                ))}
              </View>
            </>
          ) : null}
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
      {events.map((event, index) => {
        const day = new Date(event.start).toDateString();
        const previous = index > 0 ? new Date(events[index - 1].start).toDateString() : '';
        return (
          <View key={`${event.id}-${event.start}`} style={{ width: '100%', gap: GUTTER }}>
            {day !== previous ? (
              <Meta>
                {new Date(event.start).toLocaleDateString(loc, {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                })}
              </Meta>
            ) : null}
            <Bento span={2} style={styles.row}>
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
                allDay: event.allDay,
                repeat: event.repeat,
                alert: event.alert,
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
          </View>
        );
      })}
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
