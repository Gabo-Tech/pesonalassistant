import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { briefWindow, buildBrief, weekBounds } from './brief.ts';

const wednesday = Date.parse('2026-09-23T10:00:00');

describe('weekBounds', () => {
  it('runs Monday through the next Monday', () => {
    const week = weekBounds(wednesday, 'this');
    const from = new Date(week.from);
    const to = new Date(week.to);
    assert.equal(from.getDay(), 1);
    assert.equal(from.getDate(), 21);
    assert.equal(from.getHours(), 0);
    assert.equal(to.getDate(), 28);
    assert.equal(to.getTime() - from.getTime(), 7 * 86_400_000);
  });
});

describe('buildBrief', () => {
  it('counts the week and keeps overdue tasks on their own line', () => {
    const week = weekBounds(wednesday, 'this');
    const text = buildBrief({
      now: wednesday,
      span: 'this week',
      ...week,
      locale: 'en',
      events: [{ title: 'Dentist', start: Date.parse('2026-09-24T09:00:00') }],
      reminders: [{ text: 'Call mum', dueAt: Date.parse('2026-09-24T14:00:00') }],
      tasks: [
        { title: 'Buy milk', dueAt: Date.parse('2026-09-25T12:00:00'), status: 'open' },
        { title: 'File taxes', dueAt: Date.parse('2026-09-18T12:00:00'), status: 'open' },
        { title: 'Someday', dueAt: null, status: 'open' },
      ],
    });
    assert.match(text, /This week: 1 appointment, 1 reminder, 1 task/);
    assert.match(text, /Dentist/);
    assert.match(text, /Call mum/);
    assert.match(text, /Buy milk/);
    assert.match(text, /Overdue: File taxes/);
    assert.equal(text.includes('Someday'), false);
  });

  it('says the span is clear', () => {
    const today = briefWindow('today', wednesday);
    const text = buildBrief({
      now: wednesday,
      ...today,
      locale: 'es',
      events: [],
      reminders: [],
      tasks: [],
    });
    assert.equal(text, 'Hoy está libre.');
  });
});
