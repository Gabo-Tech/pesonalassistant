import { alarmSearchText, cancelAlarm, createAlarm, listAlarms } from '../db/alarms';
import { createEvent, listEvents } from '../calendar/events';
import { deleteFactByTitle, listFacts, upsertFact } from '../db/facts';
import { appendToNote, createNote, searchNotes } from '../db/notes';
import { completeReminder, createReminder, listReminders } from '../db/reminders';
import { requestConfirm } from '../share/confirmGate';
import { armSend } from '../share/crawler';
import { openDraft, TARGETS, type ShareTarget } from '../share/intents';
import { peekSettings } from '../settings/store';
import { findUniqueMatch } from './match';
import { forgetFactQuery, pickFactToForget, rememberFactInput } from '../db/factsFormat';
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

/** Executes a model action, or queues it for confirmation if it has side effects. */
export async function routeAction(action: Action, fallbackSay: string): Promise<RouteResult> {
  const timeout = peekSettings().confirmTimeoutMs;

  switch (action.tool) {
    /* ---------------- notes: local and reversible, so no confirm ---------------- */
    case 'create_note': {
      const title = action.title?.trim() || firstLine(action.text) || 'Note';
      const body = action.text?.trim() ?? '';
      await createNote(title, body);
      return ok(`Saved note "${title}".`);
    }

    case 'append_note': {
      const extra = action.text?.trim();
      if (!extra) return ok('What should I add to the note?');

      let id = action.id;
      if (!id) {
        const query = action.title?.trim() || action.query?.trim();
        if (!query) return ok('Which note should I add to?');
        const found = await searchNotes(query);
        const match = findUniqueMatch(found, query, (note) => note.title);
        if (!match) return ok('I could not tell which note you mean.');
        id = match.id;
      }

      await appendToNote(id, extra);
      return ok('Added to the note.');
    }

    case 'search_notes': {
      const query = action.query?.trim() || action.text?.trim() || '';
      if (!query) return ok('What should I search for?');
      const found = await searchNotes(query);
      if (found.length === 0) return ok(`No notes match "${query}".`);
      return ok(
        `Found ${found.length}: ${found
          .slice(0, 3)
          .map((n) => n.title)
          .join(', ')}.`,
      );
    }

    /* ---------------- reminders and events: confirm before writing ---------------- */
    case 'create_reminder': {
      const text = action.text?.trim() || action.title?.trim();
      if (!text) return ok('What should I remind you about?');

      const when = parseWhen(action.when ?? '');
      if (!when) return ok('When should I remind you?');

      const label = formatWhen(when.at);
      requestConfirm(
        {
          kind: 'reminder',
          summary: `Reminder: ${label}`,
          detail: text,
          speech: `Set a reminder for ${label}. Say send or cancel.`,
          confirmLabel: 'Create',
          execute: async () => {
            await createReminder(text, when.at);
            return `Reminder set for ${label}.`;
          },
        },
        timeout,
      );
      return pending(`Reminder for ${label}? Say send or cancel.`);
    }

    case 'list_reminders': {
      const rows = await listReminders();
      if (rows.length === 0) return ok('No reminders pending.');
      return ok(
        `${rows.length} pending: ${rows
          .slice(0, 5)
          .map((row) => `${row.text} at ${formatWhen(row.due_at)}`)
          .join('; ')}.`,
      );
    }

    case 'complete_reminder': {
      let id = action.id;
      if (!id) {
        const query = action.text?.trim() || action.title?.trim() || action.query?.trim();
        if (!query) return ok('Which reminder should I complete?');
        const rows = await listReminders();
        const match = findUniqueMatch(rows, query, (row) => row.text);
        if (!match) return ok('I could not tell which reminder you mean.');
        id = match.id;
      }
      await completeReminder(id);
      return ok('Marked done.');
    }

    case 'create_alarm': {
      const when = parseWhen(action.when ?? '');
      if (!when) return ok('When should the alarm go off?');

      const at = new Date(when.at);
      const hour = at.getHours();
      const minute = at.getMinutes();
      const repeat = parseRepeat(action.when ?? '');
      const clock = formatClockTime(hour, minute);
      const label = action.text?.trim() || action.title?.trim() || '';
      const summary = repeat === 'daily' ? `Daily alarm: ${clock}` : `Alarm: ${clock}`;

      requestConfirm(
        {
          kind: 'alarm',
          summary,
          detail: label || clock,
          speech: `Set ${repeat === 'daily' ? 'a daily alarm' : 'an alarm'} for ${clock}. Say send or cancel.`,
          confirmLabel: 'Create',
          execute: async () => {
            await createAlarm({
              label,
              hour,
              minute,
              repeat,
              nextAt: when.at,
            });
            return repeat === 'daily' ? `Daily alarm set for ${clock}.` : `Alarm set for ${clock}.`;
          },
        },
        timeout,
      );
      return pending(`${summary}? Say send or cancel.`);
    }

    case 'list_alarms': {
      const rows = await listAlarms();
      if (rows.length === 0) return ok('No alarms set.');
      return ok(
        `${rows.length} alarm${rows.length === 1 ? '' : 's'}: ${rows
          .slice(0, 5)
          .map((row) => `${formatClockTime(row.hour, row.minute)}${row.repeat === 'daily' ? ' daily' : ''}${row.label ? ` ${row.label}` : ''}`)
          .join('; ')}.`,
      );
    }

    case 'cancel_alarm': {
      let id = action.id;
      if (!id) {
        const query = action.text?.trim() || action.title?.trim() || action.query?.trim();
        if (!query) return ok('Which alarm should I cancel?');
        const rows = await listAlarms();
        const match = findUniqueMatch(rows, query, alarmSearchText);
        if (!match) return ok('I could not tell which alarm you mean.');
        id = match.id;
      }
      await cancelAlarm(id);
      return ok('Alarm cancelled.');
    }

    case 'create_event': {
      const title = action.title?.trim() || action.text?.trim();
      if (!title) return ok('What is the event called?');

      const when = parseWhen(action.when ?? '');
      if (!when) return ok('When is the event?');

      const minutes = action.duration_minutes ?? 60;
      const label = formatWhen(when.at);

      requestConfirm(
        {
          kind: 'calendar',
          summary: `Event: ${label}`,
          detail: `${title} (${minutes} min)`,
          speech: `Add ${title} on ${label}. Say send or cancel.`,
          confirmLabel: 'Create',
          execute: async () => {
            await createEvent({ title, start: when.at, end: when.at + minutes * 60_000 });
            return `Added "${title}" on ${label}.`;
          },
        },
        timeout,
      );
      return pending(`Add "${title}" on ${label}? Say send or cancel.`);
    }

    case 'list_events': {
      const from = parseWhen(action.when ?? 'today')?.at ?? Date.now();
      const dayStart = new Date(from);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + 86_400_000);

      const events = await listEvents(dayStart.getTime(), dayEnd.getTime());
      if (events.length === 0) return ok('Nothing on the calendar then.');
      return ok(
        `${events.length} event${events.length > 1 ? 's' : ''}: ${events
          .slice(0, 3)
          .map((e) => `${e.title} at ${formatWhen(e.start)}`)
          .join('; ')}.`,
      );
    }

    /* ---------------- facts: local and reversible, so no confirm ---------------- */
    case 'remember_fact': {
      const input = rememberFactInput(action);
      if (!input) return ok('What should I remember?');
      await upsertFact(input.title, input.text);
      return ok('I will remember that.');
    }

    case 'forget_fact': {
      const query = forgetFactQuery(action);
      if (!query) return ok('Which fact should I forget?');
      const facts = await listFacts();
      const match = pickFactToForget(facts, query);
      if (!match) return ok('I could not tell which fact you mean.');
      await deleteFactByTitle(match.title);
      return ok(`Forgotten ${match.title}.`);
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
  if (!text) return ok('What should the message say?');

  const recipient = action.recipient?.trim() || null;
  const label = TARGETS[target].label;
  const to = recipient ? ` to ${recipient}` : '';

  requestConfirm(
    {
      kind: 'share',
      summary: `${label}${to}`,
      detail: text,
      speech: `${target === 'x' ? 'Post on X' : `Send on ${label}${to}`}: ${text}. Say send or cancel.`,
      confirmLabel: 'Send',
      execute: async () => {
        // Arm first: the service must already be listening when the app comes up.
        const automatic = armSend(target, text);
        await openDraft(target, text, recipient);
        return automatic
          ? `Sending via ${label}.`
          : `Opened ${label} with the draft. Tap send there.`;
      },
    },
    timeout,
  );

  return { message: `${label}${to}: "${text}". Say send or cancel.`, awaitingConfirm: true };
}

function firstLine(text?: string): string {
  return text?.split('\n')[0]?.slice(0, 60).trim() ?? '';
}
