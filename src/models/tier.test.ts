import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nextHeavierModelId } from './tier.ts';

describe('nextHeavierModelId', () => {
  it('picks the next downloaded tier, not the biggest', () => {
    assert.equal(
      nextHeavierModelId('qwen2.5-0.5b-q4', [
        'qwen2.5-0.5b-q4',
        'qwen2.5-1.5b-q4',
        'qwen2.5-3b-q4',
      ]),
      'qwen2.5-1.5b-q4',
    );
  });

  it('skips a tier that is not on disk', () => {
    assert.equal(
      nextHeavierModelId('qwen2.5-0.5b-q4', ['qwen2.5-0.5b-q4', 'qwen2.5-3b-q4']),
      'qwen2.5-3b-q4',
    );
  });

  it('does not escalate from the heaviest or an unknown file', () => {
    assert.equal(nextHeavierModelId('qwen2.5-3b-q4', ['qwen2.5-3b-q4', 'qwen2.5-0.5b-q4']), null);
    assert.equal(nextHeavierModelId('custom', ['qwen2.5-1.5b-q4']), null);
    assert.equal(nextHeavierModelId(null, ['qwen2.5-1.5b-q4']), null);
  });
});
