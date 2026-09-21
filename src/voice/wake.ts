/**
 * Wake-word matching over Whisper transcripts.
 *
 * Speech recognition is fuzzy: "computer" comes back as "Computer,", "compute",
 * sometimes "computer." with a trailing period. Exact comparison would make the wake
 * word feel broken, so we compare with a small edit-distance budget.
 *
 * This is the no-account, fully-local wake word. Porcupine is more power-efficient
 * because it runs a tiny dedicated model on raw audio, but it needs a Picovoice
 * AccessKey, so it stays optional.
 */

export type WakeMatch = {
  matched: boolean;
  /** Anything the user said after the wake word, e.g. "remind me to call mum". */
  remainder: string;
};

const NO_MATCH: WakeMatch = { matched: false, remainder: '' };

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Classic Levenshtein distance, iterative two-row version. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = row;
  }

  return prev[b.length];
}

/** Roughly one typo per four characters, at least one. */
function budgetFor(phrase: string): number {
  return Math.max(1, Math.floor(phrase.replace(/\s/g, '').length / 4));
}

export function isFuzzyMatch(candidate: string, target: string): boolean {
  return editDistance(candidate, target) <= budgetFor(target);
}

/**
 * Looks for the wake word at (or very near) the start of an utterance.
 *
 * Anchoring to the start matters: if we accepted it anywhere, dictating a message that
 * mentions the wake word would retrigger the assistant mid-sentence.
 */
export function detectWake(transcript: string, wakeWord: string): WakeMatch {
  const text = normalize(transcript);
  const target = normalize(wakeWord);
  if (!text || !target) return NO_MATCH;

  const words = text.split(' ');
  const targetWordCount = target.split(' ').length;

  // Allow one junk word before the wake word ("uh computer", "hey computer").
  for (let start = 0; start <= 1 && start < words.length; start += 1) {
    const window = words.slice(start, start + targetWordCount).join(' ');
    if (isFuzzyMatch(window, target)) {
      return { matched: true, remainder: words.slice(start + targetWordCount).join(' ') };
    }
  }

  return NO_MATCH;
}
