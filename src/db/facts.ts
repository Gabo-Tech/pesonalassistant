import { getDb, now } from './index';
import { normalizeFactTitle } from './factsFormat';

export type Fact = {
  id: number;
  title: string;
  text: string;
  updated_at: number;
};

export async function upsertFact(title: string, text: string): Promise<Fact> {
  const db = await getDb();
  const key = normalizeFactTitle(title) || 'identity';
  const value = text.trim();
  const ts = now();

  await db.runAsync(
    `INSERT INTO facts (title, text, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(title) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`,
    key,
    value,
    ts,
  );

  const row = await db.getFirstAsync<Fact>('SELECT * FROM facts WHERE title = ?', key);
  if (!row) throw new Error('Failed to save fact');
  return row;
}

export async function listFacts(): Promise<Fact[]> {
  const db = await getDb();
  return db.getAllAsync<Fact>('SELECT * FROM facts ORDER BY title ASC');
}

export async function deleteFact(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM facts WHERE id = ?', id);
}

export async function deleteFactByTitle(title: string): Promise<boolean> {
  const db = await getDb();
  const key = normalizeFactTitle(title);
  const result = await db.runAsync('DELETE FROM facts WHERE title = ?', key);
  return (result.changes ?? 0) > 0;
}
