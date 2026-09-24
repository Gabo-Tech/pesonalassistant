import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { takeSentences } from './sentences.ts';

describe('takeSentences', () => {
  it('yields a sentence as soon as punctuation arrives', () => {
    assert.deepEqual(takeSentences('Hi'), { sentences: [], rest: 'Hi' });
    assert.deepEqual(takeSentences('Hi. What'), {
      sentences: ['Hi.'],
      rest: ' What',
    });
    assert.deepEqual(takeSentences('Hi. What do you need?'), {
      sentences: ['Hi.', 'What do you need?'],
      rest: '',
    });
  });

  it('does not split decimals', () => {
    assert.deepEqual(takeSentences('It is 3.14.'), {
      sentences: ['It is 3.14.'],
      rest: '',
    });
  });
});

describe('DEFAULT_VAD', () => {
  it('ends an utterance after a short silence and keeps the pre-roll', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'vad.ts'), 'utf8');
    assert.match(src, /hangoverMs: 400/);
    assert.match(src, /preRollMs: 300/);
  });
});
