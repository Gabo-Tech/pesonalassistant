import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { matchVoiceDecision, normalizeDecisionText } from './confirmGate.ts';

describe('normalizeDecisionText', () => {
  it('keeps dont as one token when the apostrophe is dropped', () => {
    assert.equal(normalizeDecisionText("don't send"), 'dont send');
    assert.equal(normalizeDecisionText('don t send'), 'dont send');
  });
});

describe('matchVoiceDecision', () => {
  it('confirms short send phrases', () => {
    assert.equal(matchVoiceDecision('send'), 'confirm');
    assert.equal(matchVoiceDecision('Yes, send it.'), 'confirm');
    assert.equal(matchVoiceDecision('post it'), 'confirm');
  });

  it('cancels and prefers cancel over confirm', () => {
    assert.equal(matchVoiceDecision('cancel'), 'cancel');
    assert.equal(matchVoiceDecision("no don't send"), 'cancel');
    assert.equal(matchVoiceDecision("don't send"), 'cancel');
    assert.equal(matchVoiceDecision('don t send'), 'cancel');
  });

  it('ignores long utterances that merely mention send', () => {
    assert.equal(
      matchVoiceDecision('please send this long dictated paragraph to marie'),
      null,
    );
  });
});
