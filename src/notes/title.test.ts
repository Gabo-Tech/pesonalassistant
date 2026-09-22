import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inferNoteTitle } from './title.ts';

describe('inferNoteTitle', () => {
  it('prefers an explicit title', () => {
    assert.equal(inferNoteTitle('# Body heading', 'Shopping'), 'Shopping');
  });

  it('uses the first markdown heading', () => {
    assert.equal(inferNoteTitle('# Wifi password\n\nhunter2'), 'Wifi password');
  });

  it('falls back to the first line', () => {
    assert.equal(inferNoteTitle('Buy milk\nand eggs'), 'Buy milk');
  });

  it('strips inline markdown', () => {
    assert.equal(inferNoteTitle('**Bold** idea'), 'Bold idea');
  });

  it('defaults when empty', () => {
    assert.equal(inferNoteTitle('   '), 'Note');
  });
});
