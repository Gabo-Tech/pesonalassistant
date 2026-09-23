import { getDb, now } from './index';

export type PreferredChannel = 'whatsapp' | 'signal' | 'call';

export type Contact = {
  id: number;
  name: string;
  phone: string;
  preferred: PreferredChannel;
  notes: string;
  created_at: number;
  updated_at: number;
};

function asChannel(value: string | undefined): PreferredChannel {
  if (value === 'signal' || value === 'call') return value;
  return 'whatsapp';
}

export async function createContact(input: {
  name: string;
  phone?: string;
  preferred?: PreferredChannel;
  notes?: string;
}): Promise<Contact> {
  const db = await getDb();
  const ts = now();
  const name = input.name.trim();
  const phone = input.phone?.trim() ?? '';
  const preferred = asChannel(input.preferred);
  const notes = input.notes?.trim() ?? '';
  const result = await db.runAsync(
    `INSERT INTO contacts (name, phone, preferred, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    name,
    phone,
    preferred,
    notes,
    ts,
    ts,
  );
  return {
    id: result.lastInsertRowId,
    name,
    phone,
    preferred,
    notes,
    created_at: ts,
    updated_at: ts,
  };
}

export async function listContacts(): Promise<Contact[]> {
  const db = await getDb();
  return db.getAllAsync<Contact>('SELECT * FROM contacts ORDER BY name COLLATE NOCASE ASC');
}

export async function updateContact(
  id: number,
  patch: { name?: string; phone?: string; preferred?: PreferredChannel; notes?: string },
): Promise<void> {
  const db = await getDb();
  const current = await db.getFirstAsync<Contact>('SELECT * FROM contacts WHERE id = ?', id);
  if (!current) return;
  await db.runAsync(
    `UPDATE contacts SET name = ?, phone = ?, preferred = ?, notes = ?, updated_at = ? WHERE id = ?`,
    patch.name?.trim() || current.name,
    patch.phone != null ? patch.phone.trim() : current.phone,
    patch.preferred ?? current.preferred,
    patch.notes != null ? patch.notes.trim() : current.notes,
    now(),
    id,
  );
}

export async function deleteContact(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM contacts WHERE id = ?', id);
}

/** Copies a phone-book row. Skips a name that is already saved so its preferred channel stays. */
export async function importContact(input: { name: string; phone: string }): Promise<boolean> {
  const name = input.name.trim();
  if (!name) return false;
  const existing = await listContacts();
  const taken = existing.some((row) => row.name.toLowerCase() === name.toLowerCase());
  if (taken) return false;
  await createContact({ name, phone: input.phone, preferred: 'whatsapp' });
  return true;
}
