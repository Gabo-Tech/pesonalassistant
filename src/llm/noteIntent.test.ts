import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chatAnswer, wantsAppendNote, wantsFiledNote, wantsMarkedNote, wantsSavedNote } from './noteIntent.ts';

describe('wantsSavedNote', () => {
  it('ignores ordinary questions', () => {
    assert.equal(wantsSavedNote('what is the capital of France?'), false);
    assert.equal(wantsSavedNote('hello'), false);
  });

  it('matches explicit English and Spanish save requests', () => {
    assert.equal(wantsSavedNote('note that the wifi password is hunter2'), true);
    assert.equal(wantsSavedNote('anota que comprar café'), true);
    assert.equal(wantsSavedNote('guarda una nota de la reunión'), true);
    assert.equal(wantsSavedNote('note in Work that the wifi password is hunter2'), true);
    assert.equal(wantsSavedNote('anota en Trabajo que la wifi es hunter2'), true);
    assert.equal(wantsSavedNote('create a note about the meeting'), true);
    assert.equal(wantsSavedNote('write down the wifi password'), true);
    assert.equal(wantsSavedNote('can you write down the wifi password'), true);
    assert.equal(wantsSavedNote('save this: hunter2'), true);
  });
});

describe('wantsFiledNote', () => {
  it('matches moving a note into a folder', () => {
    assert.equal(wantsFiledNote('put the wifi note in Work'), true);
    assert.equal(wantsFiledNote('pon la nota wifi en Trabajo'), true);
    assert.equal(wantsFiledNote('what is the capital of France?'), false);
  });
});

describe('wantsMarkedNote', () => {
  it('matches pin and color requests', () => {
    assert.equal(wantsMarkedNote('pin the shopping note'), true);
    assert.equal(wantsMarkedNote('highlight the shopping note yellow'), true);
    assert.equal(wantsMarkedNote('fija la nota de la compra'), true);
    assert.equal(wantsMarkedNote('hello'), false);
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
