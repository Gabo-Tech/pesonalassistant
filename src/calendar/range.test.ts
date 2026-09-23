import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { eventOverlaps, horizonRange } from './range.ts';

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

  it('keeps an event that overlaps the window', () => {
    const from = 1_000;
    const to = 2_000;
    assert.equal(eventOverlaps(900, 1_100, from, to), true);
    assert.equal(eventOverlaps(1_500, 1_600, from, to), true);
    assert.equal(eventOverlaps(1_900, 2_500, from, to), true);
    assert.equal(eventOverlaps(500, 900, from, to), false);
    assert.equal(eventOverlaps(2_000, 2_400, from, to), false);
  });
});
