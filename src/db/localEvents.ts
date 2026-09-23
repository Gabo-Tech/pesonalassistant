import { getDb, now } from './index';

export type LocalEvent = {
  id: number;
  title: string;
  start_at: number;
  end_at: number;
  location: string;
  all_day: number;
};

export async function createLocalEvent(input: {
  title: string;
  start: number;
  end: number;
  location?: string;
  allDay?: boolean;
}): Promise<LocalEvent> {
  const db = await getDb();
  const ts = now();
  const location = input.location ?? '';
  const allDay = input.allDay ? 1 : 0;
  const result = await db.runAsync(
    `INSERT INTO local_events (title, start_at, end_at, location, all_day, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    input.title,
    input.start,
    input.end,
    location,
    allDay,
    ts,
    ts,
  );
  return {
    id: result.lastInsertRowId,
    title: input.title,
    start_at: input.start,
    end_at: input.end,
    location,
    all_day: allDay,
  };
}

/** Rows that overlap [from, to). Same predicate as eventOverlaps in calendar/range. */
export async function listLocalEvents(from: number, to: number): Promise<LocalEvent[]> {
  const db = await getDb();
  return db.getAllAsync<LocalEvent>(
    `SELECT * FROM local_events
     WHERE start_at < ? AND end_at > ?
     ORDER BY start_at ASC`,
    to,
    from,
  );
}

export async function updateLocalEvent(
  id: number,
  patch: { title?: string; start?: number; end?: number; location?: string; allDay?: boolean },
): Promise<void> {
  const db = await getDb();
  const current = await db.getFirstAsync<LocalEvent>('SELECT * FROM local_events WHERE id = ?', id);
  if (!current) return;
  await db.runAsync(
    `UPDATE local_events
     SET title = ?, start_at = ?, end_at = ?, location = ?, all_day = ?, updated_at = ?
     WHERE id = ?`,
    patch.title ?? current.title,
    patch.start ?? current.start_at,
    patch.end ?? current.end_at,
    patch.location ?? current.location,
    patch.allDay == null ? current.all_day : patch.allDay ? 1 : 0,
    now(),
    id,
  );
}

export async function deleteLocalEvent(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM local_events WHERE id = ?', id);
}
