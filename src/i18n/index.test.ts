import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_WAKE, localeWakeWord } from './wake.ts';

describe('localeWakeWord', () => {
  it('swaps built-in defaults with the locale default', () => {
    assert.equal(localeWakeWord('es', 'computer'), DEFAULT_WAKE.es);
    assert.equal(localeWakeWord('en', 'computadora'), DEFAULT_WAKE.en);
  });

  it('keeps a custom wake word', () => {
    assert.equal(localeWakeWord('es', 'jarvis'), 'jarvis');
  });
});
