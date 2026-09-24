import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assembleCalendarItems,
  bucketByDay,
  dayKey,
  expandReminderPoints,
  monthCells,
  type ReminderPoint,
} from './items.ts';

const from = new Date(2026, 8, 1).getTime();
const to = new Date(2026, 9, 1).getTime();

describe('expandReminderPoints', () => {
  it('steps a daily reminder forward from its next due time', () => {
    const hits = expandReminderPoints(
      [
        {
          id: 3,
          text: 'Stretch',
          dueAt: new Date(2026, 8, 24, 8).getTime(),
          repeat: 'daily',
        },
      ],
      from,
      to,
    );
    assert.equal(hits.length, 7);
    assert.equal(new Date(hits[0].at).getDate(), 24);
    assert.equal(new Date(hits[hits.length - 1].at).getDate(), 30);
  });

  it('keeps weekly hits and drops a one-off outside the window', () => {
    const weekly = expandReminderPoints(
      [{ id: 4, text: 'Call', dueAt: new Date(2026, 8, 1, 18).getTime(), repeat: 'weekly' }],
      from,
      to,
    );
    assert.equal(weekly.length, 5);
    assert.deepEqual(
      weekly.map((hit) => new Date(hit.at).getDate()),
      [1, 8, 15, 22, 29],
    );

    const outside: ReminderPoint = {
      id: 1,
      text: 'Old',
      dueAt: new Date(2026, 7, 1, 9).getTime(),
      repeat: 'once',
    };
    assert.equal(expandReminderPoints([outside], from, to).length, 0);
  });
});

describe('calendar days', () => {
  it('buckets a dated task and reminder with the event, and skips an undated task', () => {
    const items = assembleCalendarItems({
      from,
      to,
      events: [
        {
          id: 'e1',
          title: 'Dentist',
          start: new Date(2026, 8, 24, 15).getTime(),
          end: new Date(2026, 8, 24, 16).getTime(),
          allDay: false,
        },
      ],
      tasks: [
        { id: 9, title: 'Buy milk', dueAt: new Date(2026, 8, 24, 12).getTime() },
        { id: 10, title: 'Someday', dueAt: null },
      ],
      reminders: [{ id: 2, text: 'Pills', dueAt: new Date(2026, 8, 24, 9).getTime(), repeat: 'once' }],
    });
    const day = bucketByDay(items).get(dayKey(new Date(2026, 8, 24, 12).getTime()));
    assert.equal(day?.length, 3);
    assert.deepEqual(
      day?.map((item) => item.kind),
      ['reminder', 'task', 'event'],
    );
    assert.equal(items.some((item) => item.title === 'Someday'), false);
  });

  it('starts the month grid on the requested weekday', () => {
    const cells = monthCells(2026, 8, 1);
    const sep1 = new Date(2026, 8, 1);
    const lead = (sep1.getDay() - 1 + 7) % 7;
    assert.equal(cells.length, 42);
    assert.equal(cells[lead]?.day, 1);
    assert.equal(cells[lead]?.inMonth, true);
    assert.equal(cells[0]?.inMonth, lead === 0);
  });
});
