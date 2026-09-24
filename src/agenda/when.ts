import { parseWhen } from '../llm/time';

export function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

/** Keeps a prefilled instant when the visible label was not edited. */
export function resolveDraftInstant(
  text: string,
  seed: { label: string; at: number } | null,
): { kind: 'at'; at: number } | { kind: 'empty' } | { kind: 'invalid' } {
  const trimmed = text.trim();
  if (!trimmed) return { kind: 'empty' };
  if (seed && trimmed === seed.label.trim()) return { kind: 'at', at: seed.at };
  const parsed = parseWhen(trimmed);
  if (!parsed) return { kind: 'invalid' };
  return { kind: 'at', at: parsed.at };
}

export function draftSeed(
  label: string,
  at: number | null | undefined,
): { label: string; at: number } | null {
  if (at == null || !label.trim()) return null;
  return { label, at };
}
