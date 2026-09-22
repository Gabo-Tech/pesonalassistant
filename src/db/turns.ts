import { getDb, now } from './index';

export type TurnRole = 'user' | 'assistant' | 'system';

export type Turn = {
  id: number;
  role: TurnRole;
  text: string;
  created_at: number;
};

const listeners = new Set<() => void>();

function publishTurns(): void {
  listeners.forEach((fn) => fn());
}

export function subscribeTurns(fn: () => void): () => void {
  listeners.add(fn);
  fn();
  return () => listeners.delete(fn);
}

export async function addTurn(role: TurnRole, text: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT INTO turns (role, text, created_at) VALUES (?, ?, ?)', role, text, now());
  publishTurns();
}

/** Most recent turns, oldest first, for rendering and for LLM context. */
export async function recentTurns(limit = 20): Promise<Turn[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Turn>(
    'SELECT * FROM turns ORDER BY id DESC LIMIT ?',
    limit,
  );
  return rows.reverse();
}

export async function clearTurns(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM turns');
  publishTurns();
}
