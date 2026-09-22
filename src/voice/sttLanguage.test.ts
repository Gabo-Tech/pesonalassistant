import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isEnglishOnlyModel, whisperLanguage } from './sttLanguage.ts';

describe('whisperLanguage', () => {
  it('forces English on .en models', () => {
    assert.equal(whisperLanguage('es', '/models/ggml-tiny.en-q5_1.bin'), 'en');
    assert.equal(isEnglishOnlyModel('/models/ggml-tiny.en-q5_1.bin'), true);
  });

  it('uses Spanish on multilingual models', () => {
    assert.equal(whisperLanguage('es', '/models/ggml-tiny-q5_1.bin'), 'es');
    assert.equal(isEnglishOnlyModel('/models/ggml-tiny-q5_1.bin'), false);
  });
});
