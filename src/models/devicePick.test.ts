import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { recommendForRam } from './devicePick.ts';

const GB = 1_000_000_000;

describe('recommendForRam', () => {
  it('keeps a small phone on tiny speech and the 0.5B model', () => {
    const pick = recommendForRam(3 * GB, 'en');
    assert.equal(pick.sttId, 'whisper-tiny-en');
    assert.equal(pick.llmId, 'qwen2.5-0.5b-q4');
    assert.equal(pick.heavierLlmId, null);
  });

  it('offers 1.5B as optional between 4 and 6 GB', () => {
    const pick = recommendForRam(5 * GB, 'es');
    assert.equal(pick.sttId, 'whisper-tiny');
    assert.equal(pick.llmId, 'qwen2.5-0.5b-q4');
    assert.equal(pick.heavierLlmId, 'qwen2.5-1.5b-q4');
  });

  it('uses base speech and 1.5B above 6 GB', () => {
    const pick = recommendForRam(8 * GB, 'en');
    assert.equal(pick.sttId, 'whisper-base-en');
    assert.equal(pick.llmId, 'qwen2.5-1.5b-q4');
  });
});
