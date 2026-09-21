import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectWake, editDistance } from './wake.ts';

describe('editDistance', () => {
  it('is zero for identical strings', () => {
    assert.equal(editDistance('computer', 'computer'), 0);
  });

  it('counts a single substitution', () => {
    assert.equal(editDistance('computer', 'computor'), 1);
  });
});

describe('detectWake', () => {
  it('matches the wake word at the start and keeps the rest', () => {
    const result = detectWake('computer remind me to call mum', 'computer');
    assert.equal(result.matched, true);
    assert.equal(result.remainder, 'remind me to call mum');
  });

  it('allows one filler word before the wake word', () => {
    const result = detectWake('uh computer', 'computer');
    assert.equal(result.matched, true);
    assert.equal(result.remainder, '');
  });

  it('does not match the wake word buried in a sentence', () => {
    const result = detectWake('please tell computer to wait', 'computer');
    assert.equal(result.matched, false);
  });

  it('tolerates a small STT typo', () => {
    const result = detectWake('computor note that the wifi is down', 'computer');
    assert.equal(result.matched, true);
    assert.equal(result.remainder, 'note that the wifi is down');
  });
});
