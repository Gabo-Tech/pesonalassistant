/**
 * Fits a chat into the on-device window before llama.rn sees it.
 *
 * The tool prompt already uses most of a 2048-token context. Continuous listening
 * stores the utterance, then sends it again with the last few turns. This drops
 * that duplicate, then the oldest turns, then the tail of the current line.
 */

export const N_CTX = 4096;

/** Room for the chat template and a token-count that is slightly short. */
export const CONTEXT_MARGIN = 32;

export type ChatMessage = {
  role: string;
  content: string;
};

export function promptBudget(nPredict: number): number {
  return N_CTX - nPredict - CONTEXT_MARGIN;
}

type Count = (messages: ChatMessage[]) => number | Promise<number>;

/**
 * Keeps the system message. Drops a stored copy of the utterance being sent,
 * then the oldest turns, then the end of the utterance, until `count` fits.
 */
export async function fitMessages(
  messages: ChatMessage[],
  budget: number,
  count: Count,
): Promise<ChatMessage[]> {
  if (messages.length === 0) return messages;

  const system = messages[0];
  const user = messages[messages.length - 1];
  let history = omitDuplicateUtterance(messages.slice(1, -1), user);

  while (history.length > 0 && (await count([system, ...history, user])) > budget) {
    history = history.slice(1);
  }

  const clipped = await clipUser(system, history, user, budget, count);
  return [system, ...history, clipped];
}

/**
 * Second attempt after the window still reports full: no history, and only
 * the first half of whatever utterance survived the first fit.
 */
export function shrinkToSystemUser(messages: ChatMessage[]): ChatMessage[] {
  const system = messages.find((message) => message.role === 'system') ?? messages[0];
  const user = [...messages].reverse().find((message) => message.role === 'user');
  const content = user?.content ?? '';
  const shortened = content.length <= 1 ? content : content.slice(0, Math.ceil(content.length / 2));
  return [
    { role: 'system', content: system?.content ?? '' },
    { role: 'user', content: shortened },
  ];
}

function omitDuplicateUtterance(history: ChatMessage[], user: ChatMessage): ChatMessage[] {
  const last = history[history.length - 1];
  if (last && last.role === 'user' && last.content === user.content) return history.slice(0, -1);
  return history;
}

async function clipUser(
  system: ChatMessage,
  history: ChatMessage[],
  user: ChatMessage,
  budget: number,
  count: Count,
): Promise<ChatMessage> {
  if ((await count([system, ...history, user])) <= budget) return user;

  let low = 0;
  let high = user.content.length;
  let best = 0;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = { ...user, content: user.content.slice(0, mid) };
    if ((await count([system, ...history, candidate])) <= budget) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return { ...user, content: user.content.slice(0, best) };
}
