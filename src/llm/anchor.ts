/**
 * "Right after the dentist" is resolved against appointments the caller already
 * loaded. This file stays free of the database so tests can run it directly.
 */

export type AnchorEvent = {
  id: string;
  title: string;
  end: number;
};

export type AnchorResolution =
  | { kind: 'time'; at: number; eventId: string; title: string }
  | { kind: 'ambiguous' }
  | { kind: 'none' };

function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** The appointment words inside "right after the dentist", or null. */
export function eventQueryFromWhen(when: string): string | null {
  const text = fold(when);
  const match = text.match(
    /^(?:right after|just after|after|justo despues de|despues de|tras)\s+(?:my |the |el |la |mi |una )?(?:appointment |cita |evento |meeting )?(.*)$/,
  );
  if (!match) return null;
  const query = match[1]
    .replace(/\b(appointment|cita|evento|meeting|reunion)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return query || null;
}

export function resolveAfterEvent(when: string, events: AnchorEvent[]): AnchorResolution {
  const query = eventQueryFromWhen(when);
  if (!query) return { kind: 'none' };

  const exact = events.filter((event) => fold(event.title) === query);
  if (exact.length === 1) return hit(exact[0]);
  if (exact.length > 1) return { kind: 'ambiguous' };

  const contained = events.filter((event) => {
    const title = fold(event.title);
    return title.includes(query) || query.includes(title);
  });
  if (contained.length === 1) return hit(contained[0]);
  if (contained.length > 1) return { kind: 'ambiguous' };
  return { kind: 'none' };
}

function hit(event: AnchorEvent): AnchorResolution {
  return { kind: 'time', at: event.end, eventId: event.id, title: event.title };
}
