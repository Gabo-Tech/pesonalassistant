import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { callUrl, signalChatUrl } from './reach.ts';

describe('reach urls', () => {
  it('opens Signal on the saved number', () => {
    assert.equal(signalChatUrl('+34 611 22 33 44'), 'https://signal.me/#p/+34611223344');
  });

  it('opens the dialer and keeps the country code', () => {
    assert.equal(callUrl('+34 611 22 33 44'), 'tel:+34611223344');
  });
});
