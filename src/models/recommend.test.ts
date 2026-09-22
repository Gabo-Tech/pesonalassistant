import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RECOMMENDED_LLM_ID } from './recommend.ts';

describe('recommendedLlm', () => {
  it('defaults new installs to the 0.5B Qwen', () => {
    assert.equal(RECOMMENDED_LLM_ID, 'qwen2.5-0.5b-q4');
  });
});
