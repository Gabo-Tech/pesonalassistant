/**
 * The assistant's entire vocabulary of actions.
 *
 * This is expressed as a JSON schema and handed to llama.cpp as a grammar
 * (`response_format: { type: 'json_schema' }`). Grammar-constrained decoding means the
 * model *cannot* emit malformed JSON or invent a tool name: the sampler only allows
 * tokens that keep the output valid. That is what makes a 1.5B model usable as a
 * router instead of a chatbot that occasionally returns prose where we expect JSON.
 */

export const TOOL_NAMES = [
  'none',
  'create_note',
  'search_notes',
  'append_note',
  'delete_note',
  'file_note',
  'mark_note',
  'create_event',
  'list_events',
  'update_event',
  'delete_event',
  'create_reminder',
  'list_reminders',
  'update_reminder',
  'complete_reminder',
  'delete_reminder',
  'create_task',
  'list_tasks',
  'update_task',
  'complete_task',
  'delete_task',
  'brief',
  'create_alarm',
  'list_alarms',
  'cancel_alarm',
  'remember_fact',
  'forget_fact',
  'create_contact',
  'delete_contact',
  'call_contact',
  'message_contact',
  'draft_whatsapp',
  'draft_signal',
  'draft_tweet',
  'web_search',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export type Action = {
  tool: ToolName;
  /** Note title, or event title. */
  title?: string;
  /** Note body, message text, tweet text, reminder text. */
  text?: string;
  /** Search query. On create_note, the folder name. */
  query?: string;
  /** Row id for append_note / complete_reminder. */
  id?: number;
  /** Contact name or phone number for messages. */
  recipient?: string;
  /** The user's own time words, parsed locally by src/llm/time.ts. */
  when?: string;
  duration_minutes?: number;
  /** 1 marks a task important. */
  priority?: number;
};

export type AssistantReply = {
  /** Short spoken response. */
  say: string;
  action?: Action;
};

/**
 * Kept deliberately flat (one optional field per concept rather than a `oneOf` per
 * tool): llama.cpp converts the schema to a GBNF grammar, and flat schemas produce
 * small, fast grammars that small models follow reliably.
 */
export const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    say: {
      type: 'string',
      description: 'One or two short sentences to speak back to the user.',
    },
    action: {
      type: 'object',
      properties: {
        tool: { type: 'string', enum: [...TOOL_NAMES] },
        title: { type: 'string' },
        text: { type: 'string' },
        query: { type: 'string' },
        id: { type: 'integer' },
        recipient: { type: 'string' },
        when: { type: 'string' },
        duration_minutes: { type: 'integer' },
        priority: { type: 'integer' },
      },
      required: ['tool'],
    },
  },
  required: ['say', 'action'],
} as const;

/** Tools whose effects leave the app and therefore always need confirmation. */
export const SHARE_TOOLS: ReadonlySet<ToolName> = new Set([
  'draft_whatsapp',
  'draft_signal',
  'draft_tweet',
  'call_contact',
]);

/** Local contact saves still ask before writing. Agenda writes run immediately. */
export const WRITE_TOOLS: ReadonlySet<ToolName> = new Set(['create_contact']);

/** Chat replies are prose. If the model still emits JSON, speak only the say field. */
export function spokenChat(raw: string): string {
  const trimmed = raw.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1)) as { say?: unknown };
      if (typeof parsed.say === 'string' && parsed.say.trim()) return parsed.say.trim();
    } catch {
      // Prose that happens to contain braces.
    }
  }
  return trimmed;
}

/** True when the model emitted a schema-shaped reply, including tool "none". */
export function toolReplyUsable(raw: string): boolean {
  const text = raw.trim();
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd <= jsonStart) return false;

  try {
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as Partial<AssistantReply>;
    const tool = parsed.action?.tool;
    return (
      typeof parsed.say === 'string' &&
      parsed.say.trim().length > 0 &&
      !!tool &&
      TOOL_NAMES.includes(tool)
    );
  } catch {
    return false;
  }
}

/**
 * Coerces whatever the model produced into our shape.
 * Grammar sampling makes this mostly defensive, but a truncated generation (hit the
 * token limit mid-object) still has to fail safely rather than throw.
 */
export function parseReply(raw: string): AssistantReply {
  const text = raw.trim();

  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd <= jsonStart) {
    return { say: text || 'Sorry, I did not catch that.' };
  }

  try {
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as Partial<AssistantReply>;
    const say = typeof parsed.say === 'string' && parsed.say.trim() ? parsed.say.trim() : 'Done.';

    const tool = parsed.action?.tool;
    if (!tool || !TOOL_NAMES.includes(tool) || tool === 'none') return { say };

    return { say, action: { ...parsed.action, tool } };
  } catch {
    return { say: 'Sorry, I could not work that out.' };
  }
}
