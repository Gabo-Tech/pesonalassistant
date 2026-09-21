import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findUniqueMatch } from './match.ts';

describe('findUniqueMatch', () => {
  const items = [
    { id: 1, text: 'Call mum' },
    { id: 2, text: 'Buy milk' },
  ];

  it('matches a unique substring', () => {
    const found = findUniqueMatch(items, 'mum', (row) => row.text);
    assert.equal(found?.id, 1);
  });

  it('returns null when two items could match', () => {
    const found = findUniqueMatch(
      [
        { id: 1, text: 'Call mum' },
        { id: 2, text: 'Call dad' },
      ],
      'call',
      (row) => row.text,
    );
    assert.equal(found, null);
  });
});
