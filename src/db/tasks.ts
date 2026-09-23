import { getDb, now } from './index';

export type TaskStatus = 'open' | 'done';

export type Task = {
  id: number;
  title: string;
  notes: string;
  due_at: number | null;
  /** 0 normal, 1 important. */
  priority: number;
  status: TaskStatus;
  created_at: number;
  updated_at: number;
};

export async function createTask(input: {
  title: string;
  notes?: string;
  dueAt?: number | null;
  priority?: number;
}): Promise<Task> {
  const db = await getDb();
  const ts = now();
  const title = input.title.trim();
  const notes = input.notes?.trim() ?? '';
  const dueAt = input.dueAt ?? null;
  const priority = input.priority === 1 ? 1 : 0;
  const result = await db.runAsync(
    `INSERT INTO tasks (title, notes, due_at, priority, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'open', ?, ?)`,
    title,
    notes,
    dueAt,
    priority,
    ts,
    ts,
  );
  return {
    id: result.lastInsertRowId,
    title,
    notes,
    due_at: dueAt,
    priority,
    status: 'open',
    created_at: ts,
    updated_at: ts,
  };
}

export async function listTasks(status?: TaskStatus): Promise<Task[]> {
  const db = await getDb();
  const sql = status
    ? `SELECT * FROM tasks WHERE status = ? ORDER BY priority DESC, due_at IS NULL, due_at ASC, created_at ASC`
    : `SELECT * FROM tasks ORDER BY status ASC, priority DESC, due_at IS NULL, due_at ASC`;
  return status ? db.getAllAsync<Task>(sql, status) : db.getAllAsync<Task>(sql);
}

export async function updateTask(
  id: number,
  patch: { title?: string; notes?: string; dueAt?: number | null; priority?: number },
): Promise<void> {
  const db = await getDb();
  const current = await db.getFirstAsync<Task>('SELECT * FROM tasks WHERE id = ?', id);
  if (!current) return;
  await db.runAsync(
    `UPDATE tasks
     SET title = ?, notes = ?, due_at = ?, priority = ?, updated_at = ?
     WHERE id = ?`,
    patch.title?.trim() || current.title,
    patch.notes != null ? patch.notes.trim() : current.notes,
    patch.dueAt === undefined ? current.due_at : patch.dueAt,
    patch.priority == null ? current.priority : patch.priority === 1 ? 1 : 0,
    now(),
    id,
  );
}

export async function completeTask(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE tasks SET status = 'done', updated_at = ? WHERE id = ?`, now(), id);
}

export async function deleteTask(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM tasks WHERE id = ?', id);
}
