import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pushToTalkState, resumeAfterSpeech, shouldIgnoreAsync } from './sessionLogic.ts';

describe('resumeAfterSpeech', () => {
  it('returns listening after a wake-only Yes?', () => {
    assert.equal(
      resumeAfterSpeech({ sessionOff: false, gatePending: false, requested: 'listening' }),
      'listening',
    );
  });

  it('keeps confirming when a gate is pending', () => {
    assert.equal(
      resumeAfterSpeech({ sessionOff: false, gatePending: true, requested: 'idle' }),
      'confirming',
    );
  });

  it('stays off if the user disabled listening during TTS', () => {
    assert.equal(
      resumeAfterSpeech({ sessionOff: true, gatePending: false, requested: 'listening' }),
      'off',
    );
  });
});

describe('pushToTalkState', () => {
  it('does not leave confirming', () => {
    assert.equal(pushToTalkState(true), 'confirming');
    assert.equal(pushToTalkState(false), 'listening');
  });
});

describe('shouldIgnoreAsync', () => {
  it('drops late TTS after stop', () => {
    assert.equal(shouldIgnoreAsync(1, 2, 'speaking'), true);
    assert.equal(shouldIgnoreAsync(1, 1, 'off'), true);
    assert.equal(shouldIgnoreAsync(1, 1, 'speaking'), false);
  });
});
