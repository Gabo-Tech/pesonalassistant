import { getDb, now } from './index';

export type Note = {
  id: number;
  title: string;
  body: string;
  created_at: number;
  updated_at: number;
};

export async function createNote(title: string, body = ''): Promise<Note> {
  const db = await getDb();
  const ts = now();
  const result = await db.runAsync(
    'INSERT INTO notes (title, body, created_at, updated_at) VALUES (?, ?, ?, ?)',
    title,
    body,
    ts,
    ts,
  );
  return { id: result.lastInsertRowId, title, body, created_at: ts, updated_at: ts };
}

export async function listNotes(limit = 100): Promise<Note[]> {
  const db = await getDb();
  return db.getAllAsync<Note>('SELECT * FROM notes ORDER BY updated_at DESC LIMIT ?', limit);
}

export async function searchNotes(query: string, limit = 20): Promise<Note[]> {
  const db = await getDb();
  // Parameter binding keeps the wildcards data, not SQL, so a spoken "%" can't break the query.
  const like = `%${query}%`;
  return db.getAllAsync<Note>(
    `SELECT * FROM notes
     WHERE title LIKE ? OR body LIKE ?
     ORDER BY updated_at DESC
     LIMIT ?`,
    like,
    like,
    limit,
  );
}

export async function updateNote(
  id: number,
  patch: { title?: string; body?: string },
): Promise<void> {
  const db = await getDb();
  const existing = await db.getFirstAsync<Note>('SELECT * FROM notes WHERE id = ?', id);
  if (!existing) throw new Error(`Note ${id} not found`);

  await db.runAsync(
    'UPDATE notes SET title = ?, body = ?, updated_at = ? WHERE id = ?',
    patch.title ?? existing.title,
    patch.body ?? existing.body,
    now(),
    id,
  );
}

export async function appendToNote(id: number, extra: string): Promise<void> {
  const db = await getDb();
  const existing = await db.getFirstAsync<Note>('SELECT * FROM notes WHERE id = ?', id);
  if (!existing) throw new Error(`Note ${id} not found`);

  const body = existing.body ? `${existing.body}\n${extra}` : extra;
  await db.runAsync('UPDATE notes SET body = ?, updated_at = ? WHERE id = ?', body, now(), id);
}

export async function deleteNote(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM notes WHERE id = ?', id);
}
