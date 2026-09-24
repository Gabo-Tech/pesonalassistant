import { isInboxLabel, normalizeFolderName, reorderIds, sanitizeNoteColor } from '../notes/organize';
import { getDb, now } from './index';

export type Note = {
  id: number;
  title: string;
  body: string;
  created_at: number;
  updated_at: number;
  folder_id: number | null;
  pinned: number;
  color: string;
  sort_order: number;
  folder_name?: string | null;
};

export type Folder = {
  id: number;
  name: string;
  sort_order: number;
  created_at: number;
};

export type NoteScope = 'all' | 'inbox' | number;

const NOTE_SELECT = `
  SELECT notes.id, notes.title, notes.body, notes.created_at, notes.updated_at,
         notes.folder_id, notes.pinned, notes.color, notes.sort_order,
         folders.name AS folder_name
  FROM notes
  LEFT JOIN folders ON folders.id = notes.folder_id
`;

const NOTE_ORDER = 'ORDER BY notes.pinned DESC, notes.sort_order ASC, notes.updated_at DESC';

export async function createNote(
  title: string,
  body = '',
  options?: { folderId?: number | null; pinned?: boolean; color?: string },
): Promise<Note> {
  const db = await getDb();
  const ts = now();
  const folderId = options?.folderId ?? null;
  const pinned = options?.pinned ? 1 : 0;
  const color = sanitizeNoteColor(options?.color ?? '');
  const result = await db.runAsync(
    `INSERT INTO notes (title, body, created_at, updated_at, folder_id, pinned, color, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    title,
    body,
    ts,
    ts,
    folderId,
    pinned,
    color,
  );
  return {
    id: result.lastInsertRowId,
    title,
    body,
    created_at: ts,
    updated_at: ts,
    folder_id: folderId,
    pinned,
    color,
    sort_order: 0,
  };
}

export async function listNotes(scope: NoteScope = 'all', limit = 200): Promise<Note[]> {
  const db = await getDb();
  if (scope === 'inbox') {
    return db.getAllAsync<Note>(
      `${NOTE_SELECT} WHERE notes.folder_id IS NULL ${NOTE_ORDER} LIMIT ?`,
      limit,
    );
  }
  if (typeof scope === 'number') {
    return db.getAllAsync<Note>(
      `${NOTE_SELECT} WHERE notes.folder_id = ? ${NOTE_ORDER} LIMIT ?`,
      scope,
      limit,
    );
  }
  return db.getAllAsync<Note>(`${NOTE_SELECT} ${NOTE_ORDER} LIMIT ?`, limit);
}

export async function searchNotes(query: string, limit = 20): Promise<Note[]> {
  const db = await getDb();
  // Parameter binding keeps the wildcards data, not SQL, so a spoken "%" can't break the query.
  const like = `%${query}%`;
  return db.getAllAsync<Note>(
    `${NOTE_SELECT}
     WHERE notes.title LIKE ? OR notes.body LIKE ?
     ${NOTE_ORDER}
     LIMIT ?`,
    like,
    like,
    limit,
  );
}

export async function getNote(id: number): Promise<Note | null> {
  const db = await getDb();
  return db.getFirstAsync<Note>(`${NOTE_SELECT} WHERE notes.id = ?`, id);
}

export async function updateNote(
  id: number,
  patch: {
    title?: string;
    body?: string;
    folderId?: number | null;
    pinned?: boolean;
    color?: string;
  },
): Promise<void> {
  const db = await getDb();
  const existing = await db.getFirstAsync<Note>('SELECT * FROM notes WHERE id = ?', id);
  if (!existing) throw new Error(`Note ${id} not found`);

  const title = patch.title ?? existing.title;
  const body = patch.body ?? existing.body;
  const folderId = 'folderId' in patch ? (patch.folderId ?? null) : existing.folder_id;
  const pinned = patch.pinned == null ? existing.pinned : patch.pinned ? 1 : 0;
  const color = patch.color == null ? existing.color : sanitizeNoteColor(patch.color);
  const contentEdited = patch.title != null || patch.body != null;

  await db.runAsync(
    `UPDATE notes
     SET title = ?, body = ?, folder_id = ?, pinned = ?, color = ?, updated_at = ?
     WHERE id = ?`,
    title,
    body,
    folderId,
    pinned,
    color,
    contentEdited ? now() : existing.updated_at,
    id,
  );
}

export async function moveNote(id: number, folderId: number | null): Promise<void> {
  await updateNote(id, { folderId });
}

export async function setNoteMark(
  id: number,
  mark: { pinned?: boolean; color?: string },
): Promise<void> {
  await updateNote(id, mark);
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

export async function listFolders(): Promise<Folder[]> {
  const db = await getDb();
  return db.getAllAsync<Folder>('SELECT * FROM folders ORDER BY sort_order ASC, name ASC');
}

/** Returns the existing folder when the name already exists, ignoring case. */
export async function ensureFolder(name: string): Promise<Folder> {
  const clean = normalizeFolderName(name);
  if (!clean || isInboxLabel(clean)) throw new Error('Folder name required');

  const db = await getDb();
  const existing = await db.getFirstAsync<Folder>(
    'SELECT * FROM folders WHERE name = ? COLLATE NOCASE',
    clean,
  );
  if (existing) return existing;

  const ts = now();
  const max = await db.getFirstAsync<{ m: number | null }>('SELECT MAX(sort_order) AS m FROM folders');
  const sort = (max?.m ?? -1) + 1;
  const result = await db.runAsync(
    'INSERT INTO folders (name, sort_order, created_at) VALUES (?, ?, ?)',
    clean,
    sort,
    ts,
  );
  return { id: result.lastInsertRowId, name: clean, sort_order: sort, created_at: ts };
}

export async function renameFolder(id: number, name: string): Promise<'ok' | 'empty' | 'taken'> {
  const clean = normalizeFolderName(name);
  if (!clean || isInboxLabel(clean)) return 'empty';

  const db = await getDb();
  const clash = await db.getFirstAsync<Folder>(
    'SELECT * FROM folders WHERE name = ? COLLATE NOCASE AND id != ?',
    clean,
    id,
  );
  if (clash) return 'taken';
  await db.runAsync('UPDATE folders SET name = ? WHERE id = ?', clean, id);
  return 'ok';
}

/** Notes in the folder return to Inbox. */
export async function deleteFolder(id: number): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE notes SET folder_id = NULL WHERE folder_id = ?', id);
    await db.runAsync('DELETE FROM folders WHERE id = ?', id);
  });
}

/** Swaps a note with its neighbor in the same folder and pin group. */
export async function reorderNote(id: number, direction: 'up' | 'down'): Promise<void> {
  const db = await getDb();
  const note = await db.getFirstAsync<Note>('SELECT * FROM notes WHERE id = ?', id);
  if (!note) return;

  const peers = await db.getAllAsync<Note>(
    `SELECT * FROM notes
     WHERE pinned = ?
       AND ((folder_id IS NULL AND ? IS NULL) OR folder_id = ?)
     ORDER BY sort_order ASC, updated_at DESC`,
    note.pinned,
    note.folder_id,
    note.folder_id,
  );
  const next = reorderIds(
    peers.map((peer) => peer.id),
    id,
    direction,
  );
  if (!next) return;

  await db.withTransactionAsync(async () => {
    for (let index = 0; index < next.length; index++) {
      await db.runAsync('UPDATE notes SET sort_order = ? WHERE id = ?', index, next[index]);
    }
  });
}
