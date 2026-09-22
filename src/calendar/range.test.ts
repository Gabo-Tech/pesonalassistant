import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { horizonRange } from './range.ts';

describe('horizonRange', () => {
  it('spans 7 days by default id', () => {
    const now = Date.parse('2026-09-22T12:00:00');
    const range = horizonRange('7d', now);
    assert.equal(range.days, 7);
    assert.equal(range.to - range.from, 7 * 86_400_000);
  });

  it('spans a year', () => {
    const now = Date.parse('2026-09-22T12:00:00');
    const range = horizonRange('1y', now);
    assert.equal(range.days, 365);
    assert.equal(range.to, now + 365 * 86_400_000);
  });
});
