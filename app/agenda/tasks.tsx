import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { AgendaScroll, Field, FormActions, FormError, SectionHead, agendaStyles } from '../../src/agenda/forms';
import { draftSeed, firstParam, resolveDraftInstant } from '../../src/agenda/when';
import { completeTask, createTask, deleteTask, listTasks, updateTask, type Task } from '../../src/db/tasks';
import { useT } from '../../src/i18n';
import { localeTag } from '../../src/i18n/wake';
import { formatWhen } from '../../src/llm/time';
import { useSettings } from '../../src/settings/store';
import { Bento, InkSwitch, Row } from '../../src/ui/Bento';
import { TextAction } from '../../src/ui/Button';
import { useTheme } from '../../src/ui/ThemeProvider';
import { Body, Meta } from '../../src/ui/Type';

type TaskDraft = {
  id?: number;
  title: string;
  notes: string;
  when: string;
  seedLabel: string;
  originalAt: number | null;
  important: boolean;
};

export default function TasksScreen() {
  const t = useTheme();
  const tr = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{ edit?: string | string[]; at?: string | string[] }>();
  const edit = firstParam(params.edit);
  const at = firstParam(params.at);
  const [settings] = useSettings();
  const loc = localeTag(settings.locale);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskDraft, setTaskDraft] = useState<TaskDraft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setTasks(await listTasks('open'));
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
        const rows = await listTasks();
        if (cancelled) return;
        const task = rows.find((row) => String(row.id) === edit);
        if (task) {
          const label = task.due_at ? formatWhen(task.due_at, loc) : '';
          setTaskDraft({
            id: task.id,
            title: task.title,
            notes: task.notes,
            when: label,
            seedLabel: label,
            originalAt: task.due_at,
            important: task.priority === 1,
          });
          setFormError(null);
        }
      } else {
        const stamp = Number(at);
        if (!Number.isFinite(stamp)) return;
        if (cancelled) return;
        const label = formatWhen(stamp, loc);
        setTaskDraft({
          title: '',
          notes: '',
          when: label,
          seedLabel: label,
          originalAt: stamp,
          important: false,
        });
        setFormError(null);
      }
      router.setParams({ edit: '', at: '' });
    })();
    return () => {
      cancelled = true;
    };
  }, [at, edit, loc, router]);

  const saveTask = async () => {
    if (!taskDraft) return;
    const title = taskDraft.title.trim();
    if (!title) return;
    const resolved = resolveDraftInstant(taskDraft.when, draftSeed(taskDraft.seedLabel, taskDraft.originalAt));
    if (resolved.kind === 'invalid') {
      setFormError(tr('agenda.invalidWhen'));
      return;
    }
    const dueAt = resolved.kind === 'at' ? resolved.at : null;
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

  return (
    <AgendaScroll>
      <FormError message={formError} />
      <SectionHead
        title={tr('agenda.tasks')}
        action={tr('agenda.addTask')}
        onPress={() => {
          setTaskDraft({ title: '', notes: '', when: '', seedLabel: '', originalAt: null, important: false });
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
            hint={tr('agenda.whenHint')}
          />
          <View style={agendaStyles.row}>
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
          <Body style={{ color: t.dim }}>{tr('agenda.noneTasks')}</Body>
        </Bento>
      )}
      {tasks.map((task) => (
        <Bento key={task.id} span={2}>
          <Row
            title={task.title}
            subtitle={`${task.priority === 1 ? `${tr('agenda.important')} · ` : ''}${task.due_at ? formatWhen(task.due_at, loc) : task.notes}`}
            onPress={() => {
              const label = task.due_at ? formatWhen(task.due_at, loc) : '';
              setTaskDraft({
                id: task.id,
                title: task.title,
                notes: task.notes,
                when: label,
                seedLabel: label,
                originalAt: task.due_at,
                important: task.priority === 1,
              });
              setFormError(null);
            }}
            trailing={
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TextAction label={tr('common.done')} onPress={() => void completeTask(task.id).then(refresh)} />
                <TextAction
                  label={tr('common.delete')}
                  danger
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
                />
              </View>
            }
          />
        </Bento>
      ))}
    </AgendaScroll>
  );
}
