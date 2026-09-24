import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  eventQueryFromWhen,
  parseEventAnchor,
  resolveAfterEvent,
  resolveEventAnchor,
  type AnchorEvent,
} from './anchor.ts';

const friday = Date.parse('2026-09-25T14:00:00'); // Friday 2pm
const fridayEnd = Date.parse('2026-09-25T15:00:00');
const thursday = Date.parse('2026-09-24T10:00:00'); // Thursday (today in screenshot era)
const now = Date.parse('2026-09-24T12:00:00'); // Thursday noon

const events: AnchorEvent[] = [
  { id: '1', title: 'Dentist checkup', start: thursday, end: thursday + 3_600_000 },
  { id: '2', title: 'Dentist follow-up', start: thursday + 7_200_000, end: thursday + 10_800_000 },
  { id: '3', title: 'Lunch', start: thursday + 1_800_000, end: thursday + 3_600_000 },
  { id: '4', title: 'Team meeting', start: friday, end: fridayEnd },
];

describe('resolveAfterEvent', () => {
  it('reads the appointment out of an English or Spanish phrase', () => {
    assert.equal(eventQueryFromWhen('right after the dentist'), 'dentist');
    assert.ok(eventQueryFromWhen('justo después de la cita del dentista'));
    assert.equal(eventQueryFromWhen('tomorrow at noon'), null);
  });

  it('fires at the end of the one matching appointment', () => {
    const hit = resolveAfterEvent('right after lunch', events);
    assert.equal(hit.kind, 'time');
    if (hit.kind !== 'time') return;
    assert.equal(hit.eventId, '3');
    assert.equal(hit.at, events[2].end);
    assert.equal(hit.title, 'Lunch');
    assert.equal(hit.offsetMs, 0);
  });

  it('asks which one when two appointments match', () => {
    const hit = resolveAfterEvent('after the dentist', events);
    assert.equal(hit.kind, 'ambiguous');
  });

  it('reports a miss', () => {
    assert.equal(resolveAfterEvent('after the opera', events).kind, 'none');
  });
});

describe('resolveEventAnchor before', () => {
  it('parses a 2 hour before offset', () => {
    const parsed = parseEventAnchor('2 hours before the meeting this Friday', now);
    assert.ok(parsed);
    assert.equal(parsed.offsetMs, -2 * 3_600_000);
    assert.ok(parsed.dayFrom);
    assert.ok(parsed.dayTo);
  });

  it('fires 2 hours before Friday meeting', () => {
    const hit = resolveEventAnchor('2 hours before the meeting this Friday', events, now);
    assert.equal(hit.kind, 'time');
    if (hit.kind !== 'time') return;
    assert.equal(hit.eventId, '4');
    assert.equal(hit.at, friday - 2 * 3_600_000);
    assert.equal(hit.offsetMs, -2 * 3_600_000);
  });

  it('defaults bare before to one hour', () => {
    const hit = resolveEventAnchor('before lunch', events, now);
    assert.equal(hit.kind, 'time');
    if (hit.kind !== 'time') return;
    assert.equal(hit.at, events[2].start - 3_600_000);
  });

  it('accepts Spanish antes de', () => {
    const parsed = parseEventAnchor('2 horas antes de la reunión', now);
    assert.ok(parsed);
    assert.equal(parsed.offsetMs, -2 * 3_600_000);
  });
});
