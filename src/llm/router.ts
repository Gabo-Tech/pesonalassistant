import { createEvent, listEvents } from '../calendar/events';
import { appendToNote, createNote, searchNotes } from '../db/notes';
import { completeReminder, createReminder, listReminders } from '../db/reminders';
import { requestConfirm } from '../share/confirmGate';
import { armSend } from '../share/crawler';
import { openDraft, TARGETS, type ShareTarget } from '../share/intents';
import { peekSettings } from '../settings/store';
import { formatWhen, parseWhen } from './time';
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
      if (!action.id || !action.text) return ok('I need which note to add to.');
      await appendToNote(action.id, action.text);
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
        `${rows.length} pending. Next: ${rows[0].text} at ${formatWhen(rows[0].due_at)}.`,
      );
    }

    case 'complete_reminder': {
      if (!action.id) return ok('Which reminder should I complete?');
      await completeReminder(action.id);
      return ok('Marked done.');
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
