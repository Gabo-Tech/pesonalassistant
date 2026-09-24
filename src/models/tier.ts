/** On-device language models, smallest first. Voice stays on the first one that is loaded. */
export const LLM_TIER_IDS = ['qwen2.5-0.5b-q4', 'qwen2.5-1.5b-q4', 'qwen2.5-3b-q4'] as const;

export type LlmTierId = (typeof LLM_TIER_IDS)[number];

/**
 * Next downloaded model above `currentId`.
 * Unknown or already-heaviest models do not escalate.
 */
export function nextHeavierModelId(
  currentId: string | null,
  downloadedIds: readonly string[],
): LlmTierId | null {
  if (!currentId) return null;
  const start = LLM_TIER_IDS.indexOf(currentId as LlmTierId);
  if (start === -1) return null;

  for (let i = start + 1; i < LLM_TIER_IDS.length; i += 1) {
    const id = LLM_TIER_IDS[i];
    if (downloadedIds.includes(id)) return id;
  }
  return null;
}
