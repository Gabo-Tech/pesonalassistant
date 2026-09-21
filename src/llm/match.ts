/** Unique fuzzy match for voice "complete that reminder" / "add to the wifi note". */
export function findUniqueMatch<T>(
  items: T[],
  query: string,
  textOf: (item: T) => string,
): T | null {
  const q = query.trim().toLowerCase();
  if (!q || items.length === 0) return null;

  const exact = items.filter((item) => textOf(item).toLowerCase() === q);
  if (exact.length === 1) return exact[0];

  const contained = items.filter((item) => {
    const text = textOf(item).toLowerCase();
    return text.includes(q) || q.includes(text);
  });
  if (contained.length === 1) return contained[0];
  return null;
}
