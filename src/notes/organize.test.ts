import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  findReusableFolder,
  isInboxLabel,
  parseNoteMark,
  reorderIds,
} from './organize.ts';

describe('findReusableFolder', () => {
  const folders = [{ id: 1, name: 'Work' }];

  it('reuses a folder when the name differs only by case or space', () => {
    assert.equal(findReusableFolder(folders, ' work ')?.id, 1);
  });

  it('does not treat Inbox as a folder name', () => {
    assert.equal(findReusableFolder(folders, 'Inbox'), null);
    assert.equal(isInboxLabel('Bandeja'), true);
    assert.equal(findReusableFolder([{ id: 2, name: 'Home' }], 'Office'), null);
  });
});

describe('parseNoteMark', () => {
  it('maps pin and color words', () => {
    assert.deepEqual(parseNoteMark('pin'), { pinned: true });
    assert.deepEqual(parseNoteMark('yellow'), { color: 'amber' });
    assert.deepEqual(parseNoteMark('highlight yellow'), { pinned: true, color: 'amber' });
    assert.deepEqual(parseNoteMark('clear'), { color: '' });
    assert.equal(parseNoteMark('hello'), null);
  });
});

describe('reorderIds', () => {
  it('swaps with the neighbor and stops at the edge', () => {
    assert.deepEqual(reorderIds([1, 2, 3], 2, 'up'), [2, 1, 3]);
    assert.equal(reorderIds([1, 2, 3], 1, 'up'), null);
    assert.equal(reorderIds([1, 2, 3], 3, 'down'), null);
  });
});
