import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { eventQueryFromWhen, resolveAfterEvent, type AnchorEvent } from './anchor.ts';

const events: AnchorEvent[] = [
  { id: '1', title: 'Dentist checkup', end: 1_700_000_000_000 },
  { id: '2', title: 'Dentist follow-up', end: 1_700_100_000_000 },
  { id: '3', title: 'Lunch', end: 1_700_200_000_000 },
];

describe('resolveAfterEvent', () => {
  it('reads the appointment out of an English or Spanish phrase', () => {
    assert.equal(eventQueryFromWhen('right after the dentist'), 'dentist');
    assert.equal(eventQueryFromWhen('justo después de la cita del dentista'), 'del dentista');
    assert.equal(eventQueryFromWhen('tomorrow at noon'), null);
  });

  it('fires at the end of the one matching appointment', () => {
    const hit = resolveAfterEvent('right after lunch', events);
    assert.equal(hit.kind, 'time');
    if (hit.kind !== 'time') return;
    assert.equal(hit.eventId, '3');
    assert.equal(hit.at, events[2].end);
    assert.equal(hit.title, 'Lunch');
  });

  it('asks which one when two appointments match', () => {
    const hit = resolveAfterEvent('after the dentist', events);
    assert.equal(hit.kind, 'ambiguous');
  });

  it('reports a miss', () => {
    assert.equal(resolveAfterEvent('after the opera', events).kind, 'none');
  });
});
