import { parseAlertMinutes, parseAllDay, parseEventRepeat } from '../calendar/expand';
import { deleteEvent, createEvent, listEvents, updateEvent } from '../calendar/events';
import { briefWindow, buildBrief } from '../agenda/brief';
import { alarmSearchText, cancelAlarm, createAlarm, listAlarms } from '../db/alarms';
import { deleteFactByTitle, listFacts, upsertFact } from '../db/facts';
import { forgetFactQuery, pickFactToForget, rememberFactInput } from '../db/factsFormat';
import { createContact, deleteContact, listContacts } from '../db/contacts';
import {
  createLocalEvent,
  deleteLocalEvent,
  listOccurrences,
  updateLocalEvent,
} from '../db/localEvents';
import {
  appendToNote,
  createNote,
  deleteNote,
  ensureFolder,
  getNote,
  moveNote,
  searchNotes,
  setNoteMark,
  type Note,
} from '../db/notes';
import { completeReminder, createReminder, deleteReminder, listReminders, updateReminder } from '../db/reminders';
import { completeTask, createTask, deleteTask, listTasks, updateTask } from '../db/tasks';
import { t } from '../i18n';
import { localeTag } from '../i18n/wake';
import { isInboxLabel, noteColorKey, parseNoteMark } from '../notes/organize';
import { inferNoteTitle } from '../notes/title';
import { requestConfirm } from '../share/confirmGate';
import { armSend, disarmSend } from '../share/crawler';
import { openCall, openDraft, planDraft, TARGETS, type ShareTarget } from '../share/intents';
import { peekSettings } from '../settings/store';
import { eventQueryFromWhen, resolveEventAnchor } from './anchor';
import { matchPeople, pickChannel, type Channel } from '../contacts/prefer';
import { findUniqueMatch } from './match';
import { chatAnswer, wantsAppendNote, wantsFiledNote, wantsMarkedNote, wantsSavedNote } from './noteIntent';
import { formatClockTime, formatWhen, parseReminderRepeat, parseRepeat, parseWhen } from './time';
import type { Action } from './tools';

export type RouteResult = {
  /** What to show and speak. Overrides the model's own `say` when we know better. */
  message: string;
  /** True when a confirmation card is now waiting for the user. */
  awaitingConfirm: boolean;
};

const ok = (message: string): RouteResult => ({ message, awaitingConfirm: false });
const pending = (message: string): RouteResult => ({ message, awaitingConfirm: true });

async function namedNote(action: Action): Promise<Note | 'missing' | 'ambiguous'> {
  if (action.id) {
    const note = await getNote(action.id);
    return note ?? 'missing';
  }
  const query = action.title?.trim() || action.query?.trim() || '';
  if (!query) return 'missing';
  const found = await searchNotes(query);
  const match = findUniqueMatch(found, query, (note) => `${note.title} ${note.body}`);
  if (match) return match;
  return found.length > 1 ? 'ambiguous' : 'missing';
}

function loc(): string {
  return localeTag(peekSettings().locale);
}

function whenLabel(ms: number): string {
  return formatWhen(ms, loc());
}

function usesPhoneCalendar(): boolean {
  return peekSettings().calendarMode === 'phone';
}

async function loadSpan(from: number, to: number): Promise<
  { id: string; title: string; start: number; end: number }[]
> {
  if (usesPhoneCalendar()) {
    return (await listEvents(from, to)).map((event) => ({
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
    }));
  }
  return (await listOccurrences(from, to)).map((row) => ({
    id: String(row.id),
    title: row.title,
    start: row.occurrenceStart,
    end: row.occurrenceEnd,
  }));
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
      const folderRaw = action.query?.trim() ?? '';
      if (folderRaw && !isInboxLabel(folderRaw)) {
        const folder = await ensureFolder(folderRaw);
        await createNote(title, body, { folderId: folder.id });
        return ok(t('router.savedNoteIn', { title, folder: folder.name }));
      }
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

    case 'file_note': {
      if (!wantsFiledNote(userText)) return ok(chatAnswer(fallbackSay, action.text));
      const named = await namedNote(action);
      if (named === 'missing') return ok(t('router.whichNote'));
      if (named === 'ambiguous') return ok(t('router.noNoteMatch'));
      const folderRaw = action.text?.trim() ?? '';
      if (!folderRaw) return ok(t('router.whichFolder'));
      if (isInboxLabel(folderRaw)) {
        await moveNote(named.id, null);
        return ok(t('router.noteInbox', { title: named.title }));
      }
      const folder = await ensureFolder(folderRaw);
      await moveNote(named.id, folder.id);
      return ok(t('router.noteFiled', { title: named.title, folder: folder.name }));
    }

    case 'mark_note': {
      if (!wantsMarkedNote(userText)) return ok(chatAnswer(fallbackSay, action.text));
      const mark = parseNoteMark(action.text ?? '');
      if (!mark) return ok(t('router.noteMarkWhat'));
      const named = await namedNote(action);
      if (named === 'missing') return ok(t('router.whichNote'));
      if (named === 'ambiguous') return ok(t('router.noNoteMatch'));
      await setNoteMark(named.id, mark);
      if (mark.color) return ok(t('router.noteColored', { title: named.title, color: t(noteColorKey(mark.color)) }));
      if (mark.color === '') return ok(t('router.noteCleared', { title: named.title }));
      if (mark.pinned) return ok(t('router.notePinned', { title: named.title }));
      return ok(t('router.noteUnpinned', { title: named.title }));
    }

    /* ---------------- reminders, tasks, events, alarms: write immediately ---------------- */
    case 'create_reminder': {
      const text = action.text?.trim() || action.title?.trim();
      if (!text) return ok(t('router.remindWhat'));

      const whenRaw = action.when ?? '';
      if (eventQueryFromWhen(whenRaw)) {
        const from = Date.now();
        const events = await loadSpan(from, from + 14 * 86_400_000);
        const resolved = resolveEventAnchor(whenRaw, events);
        if (resolved.kind === 'ambiguous') return ok(t('router.reminderWhich'));
        if (resolved.kind === 'none') return ok(t('router.reminderNoEvent'));
        if (resolved.at <= Date.now()) return ok(t('router.reminderPast'));

        const at = new Date(resolved.at);
        const clock = clockLabel(at.getHours(), at.getMinutes());
        const anchorEventId = usesPhoneCalendar() ? null : Number(resolved.eventId);
        const label = text === whenRaw ? resolved.title : text;
        await createReminder(label, resolved.at, anchorEventId, 'once', resolved.offsetMs);
        const key = resolved.offsetMs < 0 ? 'router.reminderBeforeSet' : 'router.reminderAfterSet';
        return ok(t(key, { when: clock, title: resolved.title }));
      }

      const when = parseWhen(whenRaw);
      if (!when) return ok(t('router.remindWhen'));

      const label = whenLabel(when.at);
      await createReminder(text, when.at, null, parseReminderRepeat(whenRaw));
      return ok(t('router.reminderSet', { when: label }));
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

    case 'update_reminder': {
      const query = action.title?.trim() || action.query?.trim() || '';
      if (!query && !action.id) return ok(t('router.whichReminder'));
      const rows = await listReminders();
      const match = action.id
        ? rows.find((row) => row.id === action.id)
        : findUniqueMatch(rows, query, (row) => row.text);
      if (!match) return ok(t('router.whichReminder'));
      const nextText = action.text?.trim() || match.text;
      const when = action.when?.trim() ? parseWhen(action.when) : null;
      if (action.when?.trim() && !when) return ok(t('router.remindWhen'));
      if (when && when.at <= Date.now()) return ok(t('router.reminderPast'));
      if (!action.text?.trim() && !when) return ok(t('router.remindWhen'));
      const updated = await updateReminder(match.id, {
        text: nextText,
        dueAt: when?.at,
        repeat: action.when?.trim() ? parseReminderRepeat(action.when) : undefined,
      });
      return ok(t('router.reminderUpdated', { when: whenLabel(updated.due_at) }));
    }

    case 'create_task': {
      const title = action.title?.trim() || action.text?.trim();
      if (!title) return ok(t('router.taskWhat'));
      const due = action.when ? parseWhen(action.when) : null;
      if (action.when && !due) return ok(t('router.remindWhen'));
      const priority = action.priority === 1 ? 1 : 0;
      await createTask({ title, dueAt: due?.at ?? null, priority });
      return ok(t('router.taskAdded', { title }));
    }

    case 'list_tasks': {
      const rows = await listTasks('open');
      if (rows.length === 0) return ok(t('router.noTasks'));
      return ok(
        t('router.taskList', {
          count: rows.length,
          list: rows
            .slice(0, 5)
            .map((row) => (row.due_at ? `${row.title} (${whenLabel(row.due_at)})` : row.title))
            .join('; '),
        }),
      );
    }

    case 'complete_task': {
      const query = action.text?.trim() || action.title?.trim() || action.query?.trim();
      if (!query && !action.id) return ok(t('router.whichTask'));
      const rows = await listTasks('open');
      const match = action.id
        ? rows.find((row) => row.id === action.id)
        : findUniqueMatch(rows, query ?? '', (row) => row.title);
      if (!match) return ok(t('router.whichTask'));
      await completeTask(match.id);
      return ok(t('router.taskDone'));
    }

    case 'delete_task': {
      const query = action.text?.trim() || action.title?.trim() || action.query?.trim() || '';
      if (!query && !action.id) return ok(t('router.whichTask'));
      const rows = await listTasks('open');
      const match = action.id
        ? rows.find((row) => row.id === action.id)
        : findUniqueMatch(rows, query, (row) => row.title);
      if (!match) return ok(t('router.whichTask'));
      await deleteTask(match.id);
      return ok(t('router.taskDeleted'));
    }

    case 'update_task': {
      const query = action.title?.trim() || action.query?.trim() || '';
      if (!query && !action.id) return ok(t('router.whichTask'));
      const rows = await listTasks('open');
      const match = action.id
        ? rows.find((row) => row.id === action.id)
        : findUniqueMatch(rows, query, (row) => row.title);
      if (!match) return ok(t('router.whichTask'));
      const nextTitle = action.text?.trim() || match.title;
      const due = action.when?.trim() ? parseWhen(action.when) : null;
      if (action.when?.trim() && !due) return ok(t('router.remindWhen'));
      if (!action.text?.trim() && !action.when?.trim() && action.priority !== 1) {
        return ok(t('router.whichTask'));
      }
      await updateTask(match.id, {
        title: nextTitle,
        dueAt: due ? due.at : undefined,
        priority: action.priority === 1 ? 1 : undefined,
      });
      return ok(t('router.taskUpdated', { title: nextTitle }));
    }

    case 'brief': {
      const window = briefWindow(action.when ?? 'this week');
      const [events, reminders, tasks] = await Promise.all([
        loadSpan(window.from, window.to),
        listReminders(),
        listTasks(),
      ]);
      return ok(
        buildBrief({
          now: Date.now(),
          span: window.span,
          from: window.from,
          to: window.to,
          locale: peekSettings().locale,
          events: events.map((event) => ({ title: event.title, start: event.start })),
          reminders: reminders.map((row) => ({ text: row.text, dueAt: row.due_at })),
          tasks: tasks.map((row) => ({ title: row.title, dueAt: row.due_at, status: row.status })),
        }),
      );
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
      await createAlarm({
        label,
        hour,
        minute,
        repeat,
        nextAt: when.at,
      });
      return ok(
        repeat === 'daily' ? t('router.alarmDailySet', { clock }) : t('router.alarmOnceSet', { clock }),
      );
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

      const spoken = `${action.when ?? ''} ${title}`;
      const when = parseWhen(action.when ?? '');
      if (!when) return ok(t('router.eventWhen'));

      const allDay = parseAllDay(spoken);
      const repeat = parseEventRepeat(spoken);
      const alertMinutes = parseAlertMinutes(spoken);
      const minutes = action.duration_minutes ?? 60;
      let start = when.at;
      let end = when.at + minutes * 60_000;
      if (allDay) {
        const day = new Date(when.at);
        day.setHours(0, 0, 0, 0);
        start = day.getTime();
        end = start + 86_400_000;
      }
      const label = whenLabel(start);

      if (usesPhoneCalendar()) {
        await createEvent({ title, start, end });
      } else {
        await createLocalEvent({ title, start, end, allDay, repeat, alertMinutes });
      }
      return ok(t('router.eventAdded', { title, when: label }));
    }

    case 'list_events': {
      const from = parseWhen(action.when ?? 'today')?.at ?? Date.now();
      const dayStart = new Date(from);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + 86_400_000);
      const fromMs = dayStart.getTime();
      const toMs = dayEnd.getTime();

      const events = await (usesPhoneCalendar()
        ? listEvents(fromMs, toMs)
        : loadSpan(fromMs, toMs));
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
      const events = await (usesPhoneCalendar()
        ? listEvents(now, now + 30 * 86_400_000)
        : loadSpan(now, now + 30 * 86_400_000));
      const match = findUniqueMatch(events, query, (event) => event.title);
      if (!match) return ok(t('router.whichEvent'));
      if (usesPhoneCalendar()) await deleteEvent(match.id);
      else await deleteLocalEvent(Number(match.id));
      return ok(t('router.eventDeleted'));
    }

    case 'update_event': {
      const query = action.title?.trim() || action.query?.trim() || '';
      if (!query && !action.id) return ok(t('router.whichEvent'));
      const now = Date.now();
      const events = await (usesPhoneCalendar()
        ? listEvents(now, now + 30 * 86_400_000)
        : loadSpan(now, now + 30 * 86_400_000));
      const match = action.id
        ? events.find((event) => event.id === String(action.id))
        : findUniqueMatch(events, query, (event) => event.title);
      if (!match) return ok(t('router.whichEvent'));
      const nextTitle = action.text?.trim() || match.title;
      const when = action.when?.trim() ? parseWhen(action.when) : null;
      if (action.when?.trim() && !when) return ok(t('router.eventWhen'));
      if (!action.text?.trim() && !when && action.duration_minutes == null) {
        return ok(t('router.eventWhen'));
      }
      const span = action.duration_minutes
        ? action.duration_minutes * 60_000
        : Math.max(match.end - match.start, 60_000);
      const start = when?.at ?? match.start;
      const end = when || action.duration_minutes != null ? start + span : match.end;
      if (usesPhoneCalendar()) {
        await updateEvent(match.id, { title: nextTitle, start, end });
      } else {
        await updateLocalEvent(Number(match.id), { title: nextTitle, start, end });
      }
      return ok(t('router.eventUpdated', { title: nextTitle, when: whenLabel(start) }));
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
    case 'create_contact':
      return createContactAction(action, timeout);
    case 'delete_contact':
      return deleteContactAction(action);
    case 'call_contact':
      return callContactAction(action, timeout);
    case 'message_contact':
      return messageContactAction(action, timeout);

    case 'none':
    default:
      return ok(fallbackSay);
  }
}

async function draftMessage(target: ShareTarget, action: Action, timeout: number): Promise<RouteResult> {
  const text = action.text?.trim();
  if (!text) return ok(t('router.messageWhat'));

  let recipient = action.recipient?.trim() || null;
  if (recipient && target !== 'x' && !/^\+?\d[\d\s()-]+$/.test(recipient)) {
    const hit = matchPeople(await listContacts(), recipient, (person) => person.name);
    if (hit.kind === 'many') return ok(t('router.whichPerson'));
    if (hit.kind === 'one') recipient = hit.item.phone || hit.item.name;
  }
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
        // Arm only when the draft will carry the approved body (Signal chat URLs do not).
        const automatic = planDraft(target, text, recipient).prefilled
          ? armSend(target, text)
          : false;
        try {
          await openDraft(target, text, recipient);
          return automatic
            ? t('router.shareSending', { label })
            : t('router.shareOpened', { label });
        } catch (error) {
          disarmSend();
          throw error;
        }
      },
    },
    timeout,
  );

  return pending(t('router.shareAsk', { label, to, text }));
}

function createContactAction(action: Action, timeout: number): RouteResult {
  const name = action.title?.trim();
  if (!name) return ok(t('router.contactWhat'));
  const phone = action.text?.trim() ?? '';
  const preferred: Channel = action.query === 'signal' || action.query === 'call' ? action.query : 'whatsapp';
  requestConfirm(
    {
      kind: 'share',
      summary: t('router.contactSummary', { name }),
      detail: phone || preferred,
      speech: t('router.contactSpeech', { name }),
      confirmLabel: t('common.save'),
      execute: async () => {
        await createContact({ name, phone, preferred });
        return t('router.contactAdded', { name });
      },
    },
    timeout,
  );
  return pending(t('router.contactAsk', { name }));
}

async function deleteContactAction(action: Action): Promise<RouteResult> {
  const query = action.title?.trim() || action.recipient?.trim() || action.query?.trim() || '';
  if (!query) return ok(t('router.whichPerson'));
  const hit = matchPeople(await listContacts(), query, (person) => person.name);
  if (hit.kind !== 'one') return ok(t('router.whichPerson'));
  await deleteContact(hit.item.id);
  return ok(t('router.contactDeleted', { name: hit.item.name }));
}

async function callContactAction(action: Action, timeout: number): Promise<RouteResult> {
  const name = action.recipient?.trim() || action.title?.trim() || '';
  if (!name) return ok(t('router.whoCall'));
  const hit = matchPeople(await listContacts(), name, (person) => person.name);
  if (hit.kind === 'many') return ok(t('router.whichPerson'));
  if (hit.kind === 'none') {
    if (/\d/.test(name)) return confirmCall(name, name, timeout);
    return ok(t('router.whoCall'));
  }
  if (!hit.item.phone) return ok(t('router.noPhone', { name: hit.item.name }));
  return confirmCall(hit.item.name, hit.item.phone, timeout);
}

async function messageContactAction(action: Action, timeout: number): Promise<RouteResult> {
  const text = action.text?.trim();
  const name = action.recipient?.trim();
  if (!text || !name) return ok(t('router.messageWhat'));
  const hit = matchPeople(await listContacts(), name, (person) => person.name);
  if (hit.kind === 'many') return ok(t('router.whichPerson'));
  if (hit.kind === 'none') return draftMessage('whatsapp', action, timeout);
  const channel = pickChannel(hit.item.preferred, null);
  if (channel === 'call') {
    if (!hit.item.phone) return ok(t('router.noPhone', { name: hit.item.name }));
    return confirmCall(hit.item.name, hit.item.phone, timeout);
  }
  return draftMessage(channel, { ...action, recipient: hit.item.phone || hit.item.name }, timeout);
}

function confirmCall(name: string, phone: string, timeout: number): RouteResult {
  requestConfirm(
    {
      kind: 'share',
      summary: t('router.callSummary', { name }),
      detail: phone,
      speech: t('router.callSpeech', { name }),
      confirmLabel: t('people.call'),
      execute: async () => {
        await openCall(phone);
        return t('router.calling', { name });
      },
    },
    timeout,
  );
  return pending(t('router.callAsk', { name }));
}
