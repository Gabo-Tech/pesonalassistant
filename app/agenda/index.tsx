import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { AgendaScroll, Field, FormActions, FormError, SectionHead, agendaStyles } from '../../src/agenda/forms';
import { draftSeed, firstParam, resolveDraftInstant } from '../../src/agenda/when';
import { buildBrief, weekBounds } from '../../src/agenda/brief';
import {
  createEvent,
  deleteEvent,
  ensureCalendarPermission,
  getEvent,
  listEvents,
  updateEvent,
  type SimpleEvent,
} from '../../src/calendar/events';
import { EVENT_HORIZONS, horizonRange, type EventHorizonId } from '../../src/calendar/range';
import { cancelAlarm, createAlarm, listAlarms, updateAlarm, type Alarm } from '../../src/db/alarms';
import {
  createLocalEvent,
  deleteLocalEvent,
  getLocalEvent,
  listOccurrences,
  updateLocalEvent,
} from '../../src/db/localEvents';
import { listReminders } from '../../src/db/reminders';
import { listTasks } from '../../src/db/tasks';
import { useT } from '../../src/i18n';
import { localeTag } from '../../src/i18n/wake';
import { formatClockTime, formatWhen, nextOccurrence, parseWhen } from '../../src/llm/time';
import { useSettings } from '../../src/settings/store';
import { Bento, Chip, GUTTER, InkSwitch } from '../../src/ui/Bento';
import { useTheme } from '../../src/ui/ThemeProvider';
import { Body, Display, Meta } from '../../src/ui/Type';

type AlarmDraft = { id?: number; time: string; label: string; daily: boolean };
type ShownEvent = SimpleEvent & {
  repeat: 'none' | 'daily' | 'weekly' | 'monthly';
  alert: number | null;
};
type EventDraft = {
  id?: string;
  title: string;
  when: string;
  seedLabel: string;
  minutes: string;
  location: string;
  originalAt?: number;
  allDay: boolean;
  repeat: 'none' | 'daily' | 'weekly' | 'monthly';
  alert: number | null;
};

const ALERTS = [
  { minutes: null, key: 'agenda.alertNone' as const },
  { minutes: 10, key: 'agenda.alert10' as const },
  { minutes: 60, key: 'agenda.alertHour' as const },
  { minutes: 1440, key: 'agenda.alertDay' as const },
];

export default function AgendaScreen() {
  const t = useTheme();
  const tr = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{ edit?: string | string[]; at?: string | string[] }>();
  const edit = firstParam(params.edit);
  const at = firstParam(params.at);
  const [settings] = useSettings();
  const loc = localeTag(settings.locale);
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [events, setEvents] = useState<ShownEvent[]>([]);
  const [weekText, setWeekText] = useState('');
  const [calendarDenied, setCalendarDenied] = useState(false);
  const [horizon, setHorizon] = useState<EventHorizonId>('7d');
  const [alarmDraft, setAlarmDraft] = useState<AlarmDraft | null>(null);
  const [eventDraft, setEventDraft] = useState<EventDraft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [alarmRows, reminderRows, taskRows] = await Promise.all([
      listAlarms(),
      listReminders(),
      listTasks('open'),
    ]);
    setAlarms(alarmRows);

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
          repeat: 'none' as const,
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

  useEffect(() => {
    if (!edit && !at) return;
    let cancelled = false;
    void (async () => {
      if (edit) {
        const draft = await loadEventDraft(edit, settings.calendarMode, loc);
        if (cancelled) return;
        if (draft) {
          setEventDraft(draft);
          setFormError(null);
        }
      } else {
        const stamp = Number(at);
        if (!Number.isFinite(stamp) || cancelled) return;
        const label = formatWhen(stamp, loc);
        setEventDraft({
          title: '',
          when: label,
          seedLabel: label,
          minutes: '60',
          location: '',
          originalAt: stamp,
          allDay: false,
          repeat: 'none',
          alert: null,
        });
        setFormError(null);
      }
      router.setParams({ edit: '', at: '' });
    })();
    return () => {
      cancelled = true;
    };
  }, [at, edit, loc, router, settings.calendarMode]);

  const saveAlarm = async () => {
    if (!alarmDraft) return;
    const when = parseWhen(alarmDraft.time);
    if (!when) {
      setFormError(tr('agenda.invalidClock'));
      return;
    }
    const clock = new Date(when.at);
    const hour = clock.getHours();
    const minute = clock.getMinutes();
    const repeat = alarmDraft.daily ? 'daily' : 'once';
    try {
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
    } catch (err) {
      setFormError(err instanceof Error ? err.message : tr('agenda.invalidClock'));
      return;
    }
    setAlarmDraft(null);
    setFormError(null);
    await refresh();
  };

  const saveEvent = async () => {
    if (!eventDraft) return;
    const resolved = resolveDraftInstant(eventDraft.when, draftSeed(eventDraft.seedLabel, eventDraft.originalAt));
    if (resolved.kind !== 'at') {
      setFormError(tr('agenda.invalidWhen'));
      return;
    }
    const minutes = Number(eventDraft.minutes) || 60;
    const title = eventDraft.title.trim();
    if (!title) return;
    let end = resolved.at + minutes * 60_000;
    let begin = resolved.at;
    if (eventDraft.allDay) {
      const day = new Date(resolved.at);
      day.setHours(0, 0, 0, 0);
      begin = day.getTime();
      end = begin + 86_400_000;
    }
    const location = eventDraft.location.trim();
    try {
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
    } catch (err) {
      setFormError(err instanceof Error ? err.message : tr('agenda.invalidWhen'));
      return;
    }
    setEventDraft(null);
    setFormError(null);
    await refresh();
  };

  return (
    <AgendaScroll>
      <FormError message={formError} />

      <Bento span={2} style={{ gap: 8 }}>
        <Meta>{tr('agenda.thisWeek')}</Meta>
        <Body>{weekText}</Body>
      </Bento>

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
          <View style={agendaStyles.row}>
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
        <Bento key={alarm.id} span={2} style={agendaStyles.row}>
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

      <Display style={{ fontSize: 28, marginTop: 12, marginBottom: 4, width: '100%' }}>
        {tr('agenda.events')}
      </Display>
      <View style={agendaStyles.chips}>
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
          setEventDraft({
            title: '',
            when: '',
            seedLabel: '',
            minutes: '60',
            location: '',
            allDay: false,
            repeat: 'none',
            alert: null,
          });
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
              <View style={agendaStyles.row}>
                <Body style={{ flex: 1 }}>{tr('agenda.allDay')}</Body>
                <InkSwitch
                  value={eventDraft.allDay}
                  onValueChange={(allDay) => setEventDraft({ ...eventDraft, allDay })}
                />
              </View>
              <View style={agendaStyles.chips}>
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
              <View style={agendaStyles.chips}>
                {ALERTS.map((option) => (
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
            <Bento span={2} style={agendaStyles.row}>
              <Pressable
                style={{ flex: 1, gap: 6 }}
                onPress={() => {
                  const label = formatWhen(event.start, loc);
                  setEventDraft({
                    id: event.id,
                    title: event.title,
                    when: label,
                    seedLabel: label,
                    minutes: String(Math.max(15, Math.round((event.end - event.start) / 60_000))),
                    location: event.location ?? '',
                    originalAt: event.start,
                    allDay: event.allDay,
                    repeat: event.repeat,
                    alert: event.alert,
                  });
                  setFormError(null);
                }}
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
    </AgendaScroll>
  );
}

async function loadEventDraft(
  id: string,
  mode: 'app' | 'phone',
  loc: string,
): Promise<EventDraft | null> {
  if (mode === 'phone') {
    const row = await getEvent(id);
    if (!row) return null;
    const label = formatWhen(row.start, loc);
    return {
      id: row.id,
      title: row.title,
      when: label,
      seedLabel: label,
      minutes: String(Math.max(15, Math.round((row.end - row.start) / 60_000))),
      location: row.location ?? '',
      originalAt: row.start,
      allDay: row.allDay,
      repeat: 'none',
      alert: null,
    };
  }
  const row = await getLocalEvent(Number(id));
  if (!row) return null;
  const label = formatWhen(row.start_at, loc);
  return {
    id: String(row.id),
    title: row.title,
    when: label,
    seedLabel: label,
    minutes: String(Math.max(15, Math.round((row.end_at - row.start_at) / 60_000))),
    location: row.location,
    originalAt: row.start_at,
    allDay: row.all_day === 1,
    repeat: row.repeat,
    alert: row.alert_minutes,
  };
}
