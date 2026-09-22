import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nextOccurrence, parseRepeat, parseWhen } from './time.ts';

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

  it('parses Spanish relative and mañana', () => {
    const relative = parseWhen('en 20 minutos', noonMonday);
    assert.ok(relative);
    assert.equal(relative.at, noonMonday + 20 * 60_000);

    const morning = parseWhen('mañana a las 9', noonMonday);
    assert.ok(morning);
    const date = new Date(morning.at);
    assert.equal(date.getDate(), 22);
    assert.equal(date.getHours(), 9);
  });

  it('parses a bare clock and Spanish a las without the word at', () => {
    const clock = parseWhen('7:30', noonMonday);
    assert.ok(clock);
    assert.equal(new Date(clock.at).getMinutes(), 30);

    const spanish = parseWhen('a las 7', noonMonday);
    assert.ok(spanish);
    assert.equal(new Date(spanish.at).getMinutes(), 0);
  });

  it('rolls a past clock time to tomorrow', () => {
    const parsed = parseWhen('at 9am', noonMonday);
    assert.ok(parsed);
    assert.ok(parsed.at > noonMonday);
  });
});

describe('parseRepeat', () => {
  it('is once unless they say every day', () => {
    assert.equal(parseRepeat('7am'), 'once');
    assert.equal(parseRepeat('every day at 7'), 'daily');
    assert.equal(parseRepeat('wake me daily at 7am'), 'daily');
    assert.equal(parseRepeat('todos los días a las 7'), 'daily');
  });
});

describe('nextOccurrence', () => {
  it('keeps a later time today', () => {
    const at = nextOccurrence(15, 0, noonMonday);
    const date = new Date(at);
    assert.equal(date.getDate(), 21);
    assert.equal(date.getHours(), 15);
    assert.equal(date.getMinutes(), 0);
  });

  it('rolls a past 7am to tomorrow', () => {
    const at = nextOccurrence(7, 0, noonMonday);
    const date = new Date(at);
    assert.equal(date.getDate(), 22);
    assert.equal(date.getHours(), 7);
    assert.equal(date.getMinutes(), 0);
  });
});
