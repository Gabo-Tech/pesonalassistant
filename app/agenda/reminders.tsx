import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { AgendaScroll, Field, FormActions, FormError, SectionHead, agendaStyles } from '../../src/agenda/forms';
import { draftSeed, firstParam, resolveDraftInstant } from '../../src/agenda/when';
import {
  completeReminder,
  createReminder,
  deleteReminder,
  getReminder,
  listReminders,
  updateReminder,
  type Reminder,
  type ReminderRepeat,
} from '../../src/db/reminders';
import { useT } from '../../src/i18n';
import { localeTag } from '../../src/i18n/wake';
import { formatWhen } from '../../src/llm/time';
import { useSettings } from '../../src/settings/store';
import { Bento, Chip } from '../../src/ui/Bento';
import { useTheme } from '../../src/ui/ThemeProvider';
import { Body, Meta } from '../../src/ui/Type';

type ReminderDraft = {
  id?: number;
  text: string;
  when: string;
  seedLabel: string;
  originalAt?: number;
  repeat: ReminderRepeat;
};

function asRepeat(value: string | undefined): ReminderRepeat {
  if (value === 'daily' || value === 'weekly') return value;
  return 'once';
}

export default function RemindersScreen() {
  const t = useTheme();
  const tr = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{ edit?: string | string[]; at?: string | string[] }>();
  const edit = firstParam(params.edit);
  const at = firstParam(params.at);
  const [settings] = useSettings();
  const loc = localeTag(settings.locale);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [reminderDraft, setReminderDraft] = useState<ReminderDraft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setReminders(await listReminders());
  }, []);

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
        const id = Number(edit);
        if (!Number.isFinite(id)) {
          if (!cancelled) router.setParams({ edit: '', at: '' });
          return;
        }
        const row = await getReminder(id);
        if (cancelled || !row) {
          if (!cancelled) router.setParams({ edit: '', at: '' });
          return;
        }
        const label = formatWhen(row.due_at, loc);
        setReminderDraft({
          id: row.id,
          text: row.text,
          when: label,
          seedLabel: label,
          originalAt: row.due_at,
          repeat: asRepeat(row.repeat),
        });
        setFormError(null);
      } else {
        const stamp = Number(at);
        if (!Number.isFinite(stamp) || cancelled) return;
        const label = formatWhen(stamp, loc);
        setReminderDraft({
          text: '',
          when: label,
          seedLabel: label,
          originalAt: stamp,
          repeat: 'once',
        });
        setFormError(null);
      }
      router.setParams({ edit: '', at: '' });
    })();
    return () => {
      cancelled = true;
    };
  }, [at, edit, loc, router]);

  const saveReminder = async () => {
    if (!reminderDraft) return;
    const text = reminderDraft.text.trim();
    if (!text) return;
    const resolved = resolveDraftInstant(
      reminderDraft.when,
      draftSeed(reminderDraft.seedLabel, reminderDraft.originalAt),
    );
    if (resolved.kind !== 'at') {
      setFormError(tr('agenda.invalidWhen'));
      return;
    }
    if (resolved.at <= Date.now()) {
      setFormError(tr('agenda.past'));
      return;
    }
    try {
      if (reminderDraft.id) {
        await updateReminder(reminderDraft.id, {
          text,
          dueAt: resolved.at,
          repeat: reminderDraft.repeat,
        });
      } else {
        await createReminder(text, resolved.at, null, reminderDraft.repeat);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : tr('agenda.invalidWhen'));
      return;
    }
    setReminderDraft(null);
    setFormError(null);
    await refresh();
  };

  return (
    <AgendaScroll>
      <FormError message={formError} />
      <SectionHead
        title={tr('agenda.reminders')}
        action={tr('agenda.addReminder')}
        onPress={() => {
          setReminderDraft({ text: '', when: '', seedLabel: '', repeat: 'once' });
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
          <View style={agendaStyles.chips}>
            {(['once', 'daily', 'weekly'] as const).map((repeat) => (
              <Chip
                key={repeat}
                label={tr(
                  repeat === 'once' ? 'agenda.once' : repeat === 'daily' ? 'agenda.daily' : 'agenda.weekly',
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
        <Bento key={reminder.id} span={2} style={agendaStyles.row}>
          <Pressable
            style={{ flex: 1, gap: 6 }}
            onPress={() => {
              const label = formatWhen(reminder.due_at, loc);
              setReminderDraft({
                id: reminder.id,
                text: reminder.text,
                when: label,
                seedLabel: label,
                originalAt: reminder.due_at,
                repeat: asRepeat(reminder.repeat),
              });
              setFormError(null);
            }}
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
    </AgendaScroll>
  );
}
