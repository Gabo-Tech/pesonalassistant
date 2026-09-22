import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatVoiceLabel, rankVoices } from './voices.ts';

const voices = [
  { identifier: 'a', name: 'English Default', language: 'en-US', quality: 'Default' },
  { identifier: 'b', name: 'English Neural', language: 'en-US', quality: 'Enhanced' },
  { identifier: 'c', name: 'Spanish Neural', language: 'es-ES', quality: 'Enhanced' },
  { identifier: 'd', name: 'Spanish Latam', language: 'spa-MEX', quality: 'Default' },
];

describe('rankVoices', () => {
  it('keeps English voices and puts Enhanced first', () => {
    const ranked = rankVoices(voices, 'en');
    assert.deepEqual(
      ranked.map((v) => v.identifier),
      ['b', 'a'],
    );
    assert.equal(ranked[0].neural, true);
  });

  it('matches Spanish ISO and spa codes', () => {
    const ranked = rankVoices(voices, 'es');
    assert.deepEqual(
      ranked.map((v) => v.identifier),
      ['c', 'd'],
    );
  });

  it('labels neural voices', () => {
    assert.equal(formatVoiceLabel({ ...voices[1], neural: true }, 'Neural'), 'English Neural (Neural)');
    assert.equal(formatVoiceLabel({ ...voices[0], neural: false }, 'Neural'), 'English Default');
  });
});
