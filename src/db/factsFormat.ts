export type PromptFact = {
  title: string;
  text: string;
};

export function normalizeFactTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40);
}

/** Compact lines for the system prompt. */
export function formatFactsForPrompt(facts: PromptFact[]): string {
  if (facts.length === 0) return 'Known facts: none yet.';
  return `Known facts:\n${facts.map((fact) => `- ${fact.title}: ${fact.text}`).join('\n')}`;
}

export function rememberFactInput(action: {
  title?: string;
  text?: string;
  query?: string;
}): { title: string; text: string } | null {
  const text = action.text?.trim() || action.query?.trim();
  if (!text) return null;
  return { title: action.title?.trim() || 'identity', text };
}

export function forgetFactQuery(action: {
  title?: string;
  text?: string;
  query?: string;
}): string {
  return action.title?.trim() || action.text?.trim() || action.query?.trim() || '';
}

export function pickFactToForget<T extends PromptFact>(facts: T[], query: string): T | null {
  const key = normalizeFactTitle(query);
  if (!key) return null;

  const exact = facts.filter((fact) => fact.title === key);
  if (exact.length === 1) return exact[0];

  const q = query.trim().toLowerCase();
  const contained = facts.filter((fact) => {
    const text = `${fact.title} ${fact.text}`.toLowerCase();
    return text.includes(q) || q.includes(fact.title);
  });
  if (contained.length === 1) return contained[0];
  return null;
}
