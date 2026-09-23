import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chatAnswer, wantsAppendNote, wantsSavedNote } from './noteIntent.ts';

describe('wantsSavedNote', () => {
  it('ignores ordinary questions', () => {
    assert.equal(wantsSavedNote('what is the capital of France?'), false);
    assert.equal(wantsSavedNote('hello'), false);
  });

  it('matches explicit English and Spanish save requests', () => {
    assert.equal(wantsSavedNote('note that the wifi password is hunter2'), true);
    assert.equal(wantsSavedNote('anota que comprar café'), true);
    assert.equal(wantsSavedNote('guarda una nota de la reunión'), true);
  });
});

describe('wantsAppendNote', () => {
  it('requires both an add verb and a note', () => {
    assert.equal(wantsAppendNote('add milk to the shopping note'), true);
    assert.equal(wantsAppendNote('what should I add?'), false);
  });
});

describe('chatAnswer', () => {
  it('keeps a real reply', () => {
    assert.equal(chatAnswer('Paris.', 'The capital is Paris'), 'Paris.');
  });

  it('uses the note body when say only claims it was saved', () => {
    assert.equal(chatAnswer('Saved that note.', 'Paris is the capital.'), 'Paris is the capital.');
    assert.equal(chatAnswer('Nota guardada.', 'Comprar café'), 'Comprar café');
  });
});
