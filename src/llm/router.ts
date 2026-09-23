import { deleteEvent, createEvent, listEvents } from '../calendar/events';
import { alarmSearchText, cancelAlarm, createAlarm, listAlarms } from '../db/alarms';
import { deleteFactByTitle, listFacts, upsertFact } from '../db/facts';
import { forgetFactQuery, pickFactToForget, rememberFactInput } from '../db/factsFormat';
import { appendToNote, createNote, deleteNote, searchNotes } from '../db/notes';
import { completeReminder, createReminder, deleteReminder, listReminders } from '../db/reminders';
import { t } from '../i18n';
import { localeTag } from '../i18n/wake';
import { inferNoteTitle } from '../notes/title';
import { requestConfirm } from '../share/confirmGate';
import { armSend } from '../share/crawler';
import { openDraft, TARGETS, type ShareTarget } from '../share/intents';
import { peekSettings } from '../settings/store';
import { findUniqueMatch } from './match';
import { chatAnswer, wantsAppendNote, wantsSavedNote } from './noteIntent';
import { formatClockTime, formatWhen, parseRepeat, parseWhen } from './time';
import type { Action } from './tools';

export type RouteResult = {
  /** What to show and speak. Overrides the model's own `say` when we know better. */
  message: string;
  /** True when a confirmation card is now waiting for the user. */
  awaitingConfirm: boolean;
};

const ok = (message: string): RouteResult => ({ message, awaitingConfirm: false });
const pending = (message: string): RouteResult => ({ message, awaitingConfirm: true });

function loc(): string {
  return localeTag(peekSettings().locale);
}

function whenLabel(ms: number): string {
  return formatWhen(ms, loc());
}

function clockLabel(hour: number, minute: number): string {
  return formatClockTime(hour, minute, loc());
}

/** Executes a model action, or queues it for confirmation if it has side effects. */
export async function routeAction(
  action: Action,
  fallbackSay: string,
  userText = '',
): Promise<RouteResult> {
  const timeout = peekSettings().confirmTimeoutMs;

  switch (action.tool) {
    /* ---------------- notes: local and reversible, so no confirm ---------------- */
    case 'create_note': {
      const body = action.text?.trim() ?? '';
      if (!wantsSavedNote(userText)) return ok(chatAnswer(fallbackSay, body));
      const title = inferNoteTitle(body, action.title);
      await createNote(title, body);
      return ok(t('router.savedNote', { title }));
    }

    case 'append_note': {
      const extra = action.text?.trim();
      if (!wantsAppendNote(userText)) return ok(chatAnswer(fallbackSay, extra));
      if (!extra) return ok(t('router.whatAdd'));

      let id = action.id;
      if (!id) {
        const query = action.title?.trim() || action.query?.trim();
        if (!query) return ok(t('router.whichNote'));
        const found = await searchNotes(query);
        const match = findUniqueMatch(found, query, (note) => note.title);
        if (!match) return ok(t('router.noNoteMatch'));
        id = match.id;
      }

      await appendToNote(id, extra);
      return ok(t('router.addedToNote'));
    }

    case 'search_notes': {
      const query = action.query?.trim() || action.text?.trim() || '';
      if (!query) return ok(t('router.whatSearch'));
      const found = await searchNotes(query);
      if (found.length === 0) return ok(t('router.noNotes', { query }));
      return ok(
        t('router.foundNotes', {
          count: found.length,
          titles: found
            .slice(0, 3)
            .map((n) => n.title)
            .join(', '),
        }),
      );
    }

    case 'delete_note': {
      const query = action.title?.trim() || action.query?.trim() || action.text?.trim() || '';
      if (!query) return ok(t('router.whichNoteDelete'));
      const found = await searchNotes(query);
      const match = findUniqueMatch(found, query, (note) => `${note.title} ${note.body}`);
      if (!match) return ok(t('router.noNoteMatch'));
      await deleteNote(match.id);
      return ok(t('router.noteDeleted'));
    }

    /* ---------------- reminders and events: confirm before writing ---------------- */
    case 'create_reminder': {
      const text = action.text?.trim() || action.title?.trim();
      if (!text) return ok(t('router.remindWhat'));

      const when = parseWhen(action.when ?? '');
      if (!when) return ok(t('router.remindWhen'));

      const label = whenLabel(when.at);
      requestConfirm(
        {
          kind: 'reminder',
          summary: t('router.reminderSummary', { when: label }),
          detail: text,
          speech: t('router.reminderSpeech', { when: label }),
          confirmLabel: t('common.create'),
          execute: async () => {
            await createReminder(text, when.at);
            return t('router.reminderSet', { when: label });
          },
        },
        timeout,
      );
      return pending(t('router.reminderAsk', { when: label }));
    }

    case 'list_reminders': {
      const rows = await listReminders();
      if (rows.length === 0) return ok(t('router.noReminders'));
      return ok(
        t('router.pendingReminders', {
          count: rows.length,
          list: rows
            .slice(0, 5)
            .map((row) => `${row.text} at ${whenLabel(row.due_at)}`)
            .join('; '),
        }),
      );
    }

    case 'complete_reminder': {
      let id = action.id;
      if (!id) {
        const query = action.text?.trim() || action.title?.trim() || action.query?.trim();
        if (!query) return ok(t('router.whichReminder'));
        const rows = await listReminders();
        const match = findUniqueMatch(rows, query, (row) => row.text);
        if (!match) return ok(t('router.whichReminder'));
        id = match.id;
      }
      await completeReminder(id);
      return ok(t('router.markedDone'));
    }

    case 'delete_reminder': {
      const query = action.text?.trim() || action.title?.trim() || action.query?.trim() || '';
      if (!query && !action.id) return ok(t('router.whichReminderDelete'));
      let id = action.id;
      if (!id) {
        const rows = await listReminders();
        const match = findUniqueMatch(rows, query, (row) => row.text);
        if (!match) return ok(t('router.whichReminderDelete'));
        id = match.id;
      }
      await deleteReminder(id);
      return ok(t('router.reminderDeleted'));
    }

    case 'create_alarm': {
      const when = parseWhen(action.when ?? '');
      if (!when) return ok(t('router.alarmWhen'));

      const at = new Date(when.at);
      const hour = at.getHours();
      const minute = at.getMinutes();
      const repeat = parseRepeat(action.when ?? '');
      const clock = clockLabel(hour, minute);
      const label = action.text?.trim() || action.title?.trim() || '';
      const summary =
        repeat === 'daily' ? t('router.alarmDaily', { clock }) : t('router.alarmOnce', { clock });

      requestConfirm(
        {
          kind: 'alarm',
          summary,
          detail: label || clock,
          speech: t('router.alarmSpeech', {
            kind: repeat === 'daily' ? t('router.alarmDailyKind') : t('router.alarmOnceKind'),
            clock,
          }),
          confirmLabel: t('common.create'),
          execute: async () => {
            await createAlarm({
              label,
              hour,
              minute,
              repeat,
              nextAt: when.at,
            });
            return repeat === 'daily'
              ? t('router.alarmDailySet', { clock })
              : t('router.alarmOnceSet', { clock });
          },
        },
        timeout,
      );
      return pending(t('router.alarmAsk', { summary }));
    }

    case 'list_alarms': {
      const rows = await listAlarms();
      if (rows.length === 0) return ok(t('router.noAlarms'));
      return ok(
        t('router.alarmList', {
          count: rows.length,
          plural: rows.length === 1 ? '' : 's',
          list: rows
            .slice(0, 5)
            .map(
              (row) =>
                `${clockLabel(row.hour, row.minute)}${row.repeat === 'daily' ? ' daily' : ''}${row.label ? ` ${row.label}` : ''}`,
            )
            .join('; '),
        }),
      );
    }

    case 'cancel_alarm': {
      let id = action.id;
      if (!id) {
        const query = action.text?.trim() || action.title?.trim() || action.query?.trim();
        if (!query) return ok(t('router.whichAlarm'));
        const rows = await listAlarms();
        const match = findUniqueMatch(rows, query, alarmSearchText);
        if (!match) return ok(t('router.whichAlarm'));
        id = match.id;
      }
      await cancelAlarm(id);
      return ok(t('router.alarmCancelled'));
    }

    case 'create_event': {
      const title = action.title?.trim() || action.text?.trim();
      if (!title) return ok(t('router.eventWhat'));

      const when = parseWhen(action.when ?? '');
      if (!when) return ok(t('router.eventWhen'));

      const minutes = action.duration_minutes ?? 60;
      const label = whenLabel(when.at);

      requestConfirm(
        {
          kind: 'calendar',
          summary: t('router.eventSummary', { when: label }),
          detail: t('router.eventDetail', { title, minutes }),
          speech: t('router.eventSpeech', { title, when: label }),
          confirmLabel: t('common.create'),
          execute: async () => {
            await createEvent({ title, start: when.at, end: when.at + minutes * 60_000 });
            return t('router.eventAdded', { title, when: label });
          },
        },
        timeout,
      );
      return pending(t('router.eventAsk', { title, when: label }));
    }

    case 'list_events': {
      const from = parseWhen(action.when ?? 'today')?.at ?? Date.now();
      const dayStart = new Date(from);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + 86_400_000);

      const events = await listEvents(dayStart.getTime(), dayEnd.getTime());
      if (events.length === 0) return ok(t('router.nothingCalendar'));
      return ok(
        t('router.eventsList', {
          count: events.length,
          plural: events.length > 1 ? 's' : '',
          list: events
            .slice(0, 3)
            .map((e) => `${e.title} at ${whenLabel(e.start)}`)
            .join('; '),
        }),
      );
    }

    case 'delete_event': {
      const query = action.title?.trim() || action.query?.trim() || action.text?.trim() || '';
      if (!query) return ok(t('router.whichEvent'));
      const now = Date.now();
      const events = await listEvents(now, now + 30 * 86_400_000);
      const match = findUniqueMatch(events, query, (event) => event.title);
      if (!match) return ok(t('router.whichEvent'));
      await deleteEvent(match.id);
      return ok(t('router.eventDeleted'));
    }

    /* ---------------- facts: local and reversible, so no confirm ---------------- */
    case 'remember_fact': {
      const input = rememberFactInput(action);
      if (!input) return ok(t('router.rememberWhat'));
      await upsertFact(input.title, input.text);
      return ok(t('router.willRemember'));
    }

    case 'forget_fact': {
      const query = forgetFactQuery(action);
      if (!query) return ok(t('router.forgetWhat'));
      const facts = await listFacts();
      const match = pickFactToForget(facts, query);
      if (!match) return ok(t('router.whichFact'));
      await deleteFactByTitle(match.title);
      return ok(t('router.forgotten', { title: match.title }));
    }

    /* ---------------- messaging: always confirmed, never auto-sent ---------------- */
    case 'draft_whatsapp':
      return draftMessage('whatsapp', action, timeout);
    case 'draft_signal':
      return draftMessage('signal', action, timeout);
    case 'draft_tweet':
      return draftMessage('x', action, timeout);

    case 'none':
    default:
      return ok(fallbackSay);
  }
}

function draftMessage(target: ShareTarget, action: Action, timeout: number): RouteResult {
  const text = action.text?.trim();
  if (!text) return ok(t('router.messageWhat'));

  const recipient = action.recipient?.trim() || null;
  const label = TARGETS[target].label;
  const to = recipient ? ` to ${recipient}` : '';

  requestConfirm(
    {
      kind: 'share',
      summary: `${label}${to}`,
      detail: text,
      speech: t('router.shareSpeech', {
        action: target === 'x' ? t('router.sharePost') : t('router.shareSend', { label, to }),
        text,
      }),
      confirmLabel: t('common.send'),
      execute: async () => {
        const automatic = armSend(target, text);
        await openDraft(target, text, recipient);
        return automatic
          ? t('router.shareSending', { label })
          : t('router.shareOpened', { label });
      },
    },
    timeout,
  );

  return pending(t('router.shareAsk', { label, to, text }));
}
