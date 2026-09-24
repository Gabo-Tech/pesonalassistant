export const noteAccentNames = ['amber', 'sage', 'sky', 'rose'] as const;

export type NoteAccent = (typeof noteAccentNames)[number];

export type NoteMark = {
  pinned?: boolean;
  color?: NoteAccent | '';
};

const COLOR_ALIASES: Record<string, NoteAccent | ''> = {
  amber: 'amber',
  yellow: 'amber',
  gold: 'amber',
  amarillo: 'amber',
  ambar: 'amber',
  sage: 'sage',
  green: 'sage',
  verde: 'sage',
  sky: 'sky',
  blue: 'sky',
  azul: 'sky',
  rose: 'rose',
  pink: 'rose',
  red: 'rose',
  rosa: 'rose',
  rojo: 'rose',
  clear: '',
  none: '',
  off: '',
  quitar: '',
};

const PIN_ON = new Set(['pin', 'pinned', 'highlight', 'highlighted', 'fijar', 'fija', 'destacar', 'destaca']);
const PIN_OFF = new Set(['unpin', 'unpinned', 'desfijar', 'desfija']);

export function normalizeFolderName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function isInboxLabel(raw: string): boolean {
  const key = normalizeFolderName(raw)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return key === 'inbox' || key === 'bandeja' || key === 'unfiled' || key === 'sin carpeta';
}

export function findReusableFolder<T extends { name: string }>(folders: T[], raw: string): T | null {
  const key = normalizeFolderName(raw).toLowerCase();
  if (!key || isInboxLabel(key)) return null;
  return folders.find((folder) => normalizeFolderName(folder.name).toLowerCase() === key) ?? null;
}

/** Spoken or typed mark text: pin, a color name, or both. */
export function parseNoteMark(raw: string): NoteMark | null {
  const parts = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return null;

  let pinned: boolean | undefined;
  let color: NoteAccent | '' | undefined;
  for (const part of parts) {
    if (PIN_OFF.has(part)) pinned = false;
    else if (PIN_ON.has(part)) pinned = true;
    else if (part in COLOR_ALIASES) color = COLOR_ALIASES[part];
  }
  if (pinned === undefined && color === undefined) return null;

  const mark: NoteMark = {};
  if (pinned !== undefined) mark.pinned = pinned;
  if (color !== undefined) mark.color = color;
  return mark;
}

export function sanitizeNoteColor(color: string): NoteAccent | '' {
  return (noteAccentNames as readonly string[]).includes(color) ? (color as NoteAccent) : '';
}

export function noteColorKey(
  color: NoteAccent,
): 'notes.color.amber' | 'notes.color.sage' | 'notes.color.sky' | 'notes.color.rose' {
  switch (color) {
    case 'amber':
      return 'notes.color.amber';
    case 'sage':
      return 'notes.color.sage';
    case 'sky':
      return 'notes.color.sky';
    case 'rose':
      return 'notes.color.rose';
  }
}

/** Neighbor swap inside one pin group. Null when the note is already at that edge. */
export function reorderIds(ids: number[], id: number, direction: 'up' | 'down'): number[] | null {
  const index = ids.indexOf(id);
  const next = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || next < 0 || next >= ids.length) return null;
  const copy = ids.slice();
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item);
  return copy;
}
