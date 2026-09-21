/**
 * Keyword router used when no GGUF is loaded yet.
 *
 * Small models are the real brain; this is a teaching / fallback layer so you can
 * exercise notes, reminders, and drafts from typed commands without a 1 GB download.
 * It only recognises a handful of English patterns — the LLM covers the rest.
 */

import type { AssistantReply } from './tools';

export function fallbackAsk(userText: string): AssistantReply {
  const text = userText.trim();
  const lower = text.toLowerCase();

  const note = lower.match(/^(?:note that|make a note|remember that)\s+(.+)/i);
  if (note) {
    const body = text.slice(text.length - note[1].length);
    return {
      say: 'Saved that note.',
      action: { tool: 'create_note', title: body.slice(0, 80), text: body },
    };
  }

  const remind = lower.match(
    /^(?:remind me(?: to)?|set a reminder(?: to)?)\s+(.+)/i,
  );
  if (remind) {
    const rest = remind[1];
    const whenMatch = rest.match(
      /\b(in\s+\d+\s+\w+|tomorrow(?:\s+at\s+.+)?|tonight(?:\s+at\s+.+)?|today(?:\s+at\s+.+)?|at\s+\d.+$|on\s+\w+.*$)/i,
    );
    const when = whenMatch?.[1] ?? 'in 10 minutes';
    const task = whenMatch ? rest.slice(0, whenMatch.index).trim() : rest;
    return {
      say: 'Reminder is ready.',
      action: { tool: 'create_reminder', text: task || rest, when },
    };
  }

  const event = lower.match(/^(?:add|create|schedule)\s+(?:an?\s+)?(?:event|meeting)\s+(.+)/i);
  if (event) {
    const rest = event[1];
    const whenMatch = rest.match(/\b(tomorrow|tonight|today|on\s+\w+|at\s+\d.+|in\s+\d+\s+\w+)/i);
    const when = whenMatch?.[0] ?? 'tomorrow at 9';
    const title = whenMatch ? rest.slice(0, whenMatch.index).trim() : rest;
    return {
      say: 'Event is ready.',
      action: { tool: 'create_event', title: title || rest, when, duration_minutes: 60 },
    };
  }

  if (/\b(what(?:'s| is) on my (?:calendar|agenda)|list events|any events)\b/.test(lower)) {
    return { say: 'Checking the calendar.', action: { tool: 'list_events', when: 'today' } };
  }

  if (/\b(list reminders|what reminders|any reminders)\b/.test(lower)) {
    return { say: 'Checking reminders.', action: { tool: 'list_reminders' } };
  }

  const search = lower.match(/^(?:search notes|find notes?|look up notes?)\s+(.+)/i);
  if (search) {
    return { say: 'Searching notes.', action: { tool: 'search_notes', query: search[1] } };
  }

  const wa = matchShare(text, /whatsapp|whats app/);
  if (wa) {
    return {
      say: 'WhatsApp draft is ready. Say send or cancel.',
      action: { tool: 'draft_whatsapp', recipient: wa.recipient, text: wa.body },
    };
  }

  const signal = matchShare(text, /signal/);
  if (signal) {
    return {
      say: 'Signal draft is ready. Say send or cancel.',
      action: { tool: 'draft_signal', recipient: signal.recipient, text: signal.body },
    };
  }

  const tweet = lower.match(/^(?:tweet|post on (?:x|twitter)|publish on (?:x|twitter))\s+(.+)/i);
  if (tweet) {
    return {
      say: 'X draft is ready. Say send or cancel.',
      action: { tool: 'draft_tweet', text: text.slice(text.length - tweet[1].length) },
    };
  }

  return {
    say: 'No on-device model is loaded yet. Download one in Settings, or try: "note that …", "remind me to … tomorrow at 9", "WhatsApp Marie I\'m late", "tweet …".',
  };
}

function matchShare(
  text: string,
  network: RegExp,
): { recipient: string | undefined; body: string } | null {
  if (!network.test(text)) return null;

  // "whatsapp marie that I'm late" / "send marie on whatsapp I'm late" / "message marie on signal: hi"
  const patterned = text.match(
    /(?:send|message|text|tell)\s+(.+?)\s+(?:on\s+)?(?:whats\s?app|signal)(?:\s+that)?\s*[:,]?\s*(.+)/i,
  );
  if (patterned) return { recipient: patterned[1].trim(), body: patterned[2].trim() };

  const alt = text.match(
    /(?:whats\s?app|signal)\s+(.+?)\s+(?:that\s+)?(.+)/i,
  );
  if (alt) return { recipient: alt[1].trim(), body: alt[2].trim() };

  return null;
}
