import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { expandEvents, parseAlertMinutes, parseEventRepeat, type SeriesEvent } from './expand.ts';

const monday = Date.parse('2026-09-21T15:00:00');
const weekFrom = Date.parse('2026-09-21T00:00:00');
const weekTo = Date.parse('2026-09-28T00:00:00');

describe('expandEvents', () => {
  it('repeats a Tuesday slot through the week window', () => {
    const series: SeriesEvent = {
      id: 1,
      title: 'Dentist',
      start: monday,
      end: monday + 60 * 60_000,
      location: '',
      allDay: false,
      repeat: 'weekly',
    };
    const hits = expandEvents([series], weekFrom, weekTo);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].title, 'Dentist');
    assert.equal(hits[0].occurrenceStart, monday);

    const nextWeek = expandEvents([series], weekTo, weekTo + 7 * 86_400_000);
    assert.equal(nextWeek.length, 1);
    assert.equal(new Date(nextWeek[0].occurrenceStart).getDate(), 28);
  });

  it('reads repeat and alert words', () => {
    assert.equal(parseEventRepeat('every Tuesday at 3'), 'weekly');
    assert.equal(parseEventRepeat('todos los días'), 'daily');
    assert.equal(parseEventRepeat('cada mes'), 'monthly');
    assert.equal(parseAlertMinutes('remind me an hour before'), 60);
    assert.equal(parseAlertMinutes('10 minutos antes'), 10);
  });
});
