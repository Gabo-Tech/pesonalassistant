/**
 * Splits a growing model transcript into sentences that can be spoken early.
 * A trailing fragment without punctuation stays in `rest` until the model finishes.
 */

const SENTENCE = /^([\s\S]*?[.!?…])(?=\s|$)/;

export function takeSentences(buffer: string): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  let rest = buffer;

  while (rest.length > 0) {
    const match = SENTENCE.exec(rest);
    if (!match) break;
    const sentence = match[1].trim();
    if (!sentence) break;
    sentences.push(sentence);
    rest = rest.slice(match[0].length);
  }

  return { sentences, rest };
}
