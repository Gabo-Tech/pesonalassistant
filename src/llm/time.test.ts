import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseWhen } from './time.ts';

const noonMonday = Date.parse('2026-09-21T12:00:00');

describe('parseWhen', () => {
  it('parses relative minutes', () => {
    const parsed = parseWhen('in 20 minutes', noonMonday);
    assert.ok(parsed);
    assert.equal(parsed.at, noonMonday + 20 * 60_000);
  });

  it('parses tomorrow morning', () => {
    const parsed = parseWhen('tomorrow at 9am', noonMonday);
    assert.ok(parsed);
    const date = new Date(parsed.at);
    assert.equal(date.getDate(), 22);
    assert.equal(date.getHours(), 9);
  });

  it('rolls a past clock time to tomorrow', () => {
    const parsed = parseWhen('at 9am', noonMonday);
    assert.ok(parsed);
    assert.ok(parsed.at > noonMonday);
  });
});
