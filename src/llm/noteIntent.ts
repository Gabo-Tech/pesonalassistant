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
  return /^(?:please\s+)?(?:note(?:\s+that|\s+in\s+.+?\s+that)|make a note|write (?:this|that) down|save (?:a |this )?note|take a note|anota(?:\s+que|\s+en\s+.+?\s+que)|apunta(?:\s+que|\s+en\s+.+?\s+que)|toma nota(?:\s+de)?|guarda una nota(?:\s+de|\s+en)?)\b/.test(
    fold(text),
  );
}

export function wantsFiledNote(text: string): boolean {
  const lower = fold(text);
  return /\b(?:put|move|file|pon|mueve|archiva)\b/.test(lower) && /\b(?:note|nota)\b/.test(lower);
}

export function wantsMarkedNote(text: string): boolean {
  const lower = fold(text);
  return /\b(?:pin|unpin|highlight|mark|fija|desfija|destaca|marca)\b/.test(lower) && /\b(?:note|nota)\b/.test(lower);
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
