import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { matchPeople, pickChannel } from './prefer.ts';

const people = [
  { name: 'Marie', preferred: 'signal' as const },
  { name: 'Maria', preferred: 'call' as const },
  { name: 'Luis', preferred: 'whatsapp' as const },
];

describe('pickChannel', () => {
  it('uses the saved preference unless the sentence names a platform', () => {
    assert.equal(pickChannel('signal', null), 'signal');
    assert.equal(pickChannel('signal', 'whatsapp'), 'whatsapp');
    assert.equal(pickChannel('whatsapp', 'call'), 'call');
  });
});

describe('matchPeople', () => {
  it('finds one person and asks when two names could match', () => {
    assert.equal(matchPeople(people, 'Luis', (person) => person.name).kind, 'one');
    assert.equal(matchPeople(people, 'Mar', (person) => person.name).kind, 'many');
    assert.equal(matchPeople(people, 'nobody', (person) => person.name).kind, 'none');
  });
});
