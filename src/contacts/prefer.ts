export type Channel = 'whatsapp' | 'signal' | 'call';

export type PersonHit<T> = { kind: 'one'; item: T } | { kind: 'many' } | { kind: 'none' };

export function matchPeople<T>(items: T[], query: string, nameOf: (item: T) => string): PersonHit<T> {
  const q = query.trim().toLowerCase();
  if (!q || items.length === 0) return { kind: 'none' };

  const exact = items.filter((item) => nameOf(item).toLowerCase() === q);
  if (exact.length === 1) return { kind: 'one', item: exact[0] };
  if (exact.length > 1) return { kind: 'many' };

  const contained = items.filter((item) => {
    const name = nameOf(item).toLowerCase();
    return name.includes(q) || q.includes(name);
  });
  if (contained.length === 1) return { kind: 'one', item: contained[0] };
  if (contained.length > 1) return { kind: 'many' };
  return { kind: 'none' };
}

/** An explicit WhatsApp or Signal word wins. Otherwise use the saved preference. */
export function pickChannel(preferred: Channel, spoken: Channel | null): Channel {
  return spoken ?? preferred;
}
