/**
 * The small on-device model often answers a question by calling create_note.
 * Only an explicit save or append request should write a note.
 */

function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function wantsSavedNote(text: string): boolean {
  return /^(?:please\s+)?(?:note that|make a note|write (?:this|that) down|save (?:a |this )?note|take a note|anota(?: que)?|apunta(?: que)?|toma nota(?: de)?|guarda una nota(?: de)?)\b/.test(
    fold(text),
  );
}

export function wantsAppendNote(text: string): boolean {
  const lower = fold(text);
  return /\b(?:add|append|anade|agrega|suma)\b/.test(lower) && /\b(?:note|nota)\b/.test(lower);
}

const SAVED_ONLY =
  /^(?:saved(?: that)?(?: note)?[.!]?|nota guardada[.!]?|listo[.!]?|done[.!]?|ok(?:ay)?[.!]?)$/i;

/** Prefer the spoken answer. A generic "saved" line yields the note body instead. */
export function chatAnswer(say: string, noteText?: string): string {
  const spoken = say.trim();
  const body = noteText?.trim() ?? '';
  if (spoken && !SAVED_ONLY.test(spoken)) return spoken;
  if (body) return body;
  return spoken;
}
