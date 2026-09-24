import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  afterCommandResume,
  afterBlankSpeech,
  pushToTalkState,
  resumeAfterSpeech,
  shouldIgnoreAsync,
  unsaidRemainder,
} from './sessionLogic.ts';

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

describe('afterCommandResume', () => {
  it('stays in listening so the next utterance skips the wake word', () => {
    assert.equal(afterCommandResume(false), 'listening');
    assert.equal(afterCommandResume(true), 'confirming');
  });
});

describe('pushToTalkState', () => {
  it('does not leave confirming', () => {
    assert.equal(pushToTalkState(true), 'confirming');
    assert.equal(pushToTalkState(false), 'listening');
  });
});

describe('afterBlankSpeech', () => {
  it('stays listening so the next try does not need the wake word', () => {
    assert.equal(afterBlankSpeech('listening'), 'listening');
    assert.equal(afterBlankSpeech('idle'), 'idle');
    assert.equal(afterBlankSpeech('confirming'), 'confirming');
  });
});

describe('unsaidRemainder', () => {
  it('speaks only the part that was not already queued', () => {
    assert.equal(unsaidRemainder('Hi. What do you need?', ['Hi.']), 'What do you need?');
    assert.equal(unsaidRemainder('Hi. What do you need?', ['Hi.', 'What do you need?']), '');
  });

  it('does not repeat when the spoken text diverges', () => {
    assert.equal(unsaidRemainder('All set.', ['Something else.']), '');
  });
});

describe('shouldIgnoreAsync', () => {
  it('drops late TTS after stop', () => {
    assert.equal(shouldIgnoreAsync(1, 2, 'speaking'), true);
    assert.equal(shouldIgnoreAsync(1, 1, 'off'), true);
    assert.equal(shouldIgnoreAsync(1, 1, 'speaking'), false);
  });
});
