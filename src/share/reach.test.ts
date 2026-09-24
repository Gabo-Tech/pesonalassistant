import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { callUrl, planDraft, signalChatUrl } from './reach.ts';

describe('reach urls', () => {
  it('opens Signal on the saved number', () => {
    assert.equal(signalChatUrl('+34 611 22 33 44'), 'https://signal.me/#p/+34611223344');
  });

  it('opens the dialer and keeps the country code', () => {
    assert.equal(callUrl('+34 611 22 33 44'), 'tel:+34611223344');
  });
});

describe('planDraft', () => {
  it('prefills WhatsApp via wa.me when a phone is known', () => {
    const plan = planDraft('whatsapp', 'Hi', '+34611223344');
    assert.equal(plan.kind, 'url');
    if (plan.kind !== 'url') return;
    assert.equal(plan.prefilled, true);
    assert.match(plan.url, /wa\.me\/34611223344/);
    assert.match(plan.url, /text=Hi/);
  });

  it('does not open an empty Signal chat when there is a message body', () => {
    const plan = planDraft('signal', 'Hi Pepe', '+34611223344');
    assert.equal(plan.kind, 'send');
    if (plan.kind !== 'send') return;
    assert.equal(plan.prefilled, true);
    assert.equal(plan.packageName, 'org.thoughtcrime.securesms');
    assert.equal(plan.text, 'Hi Pepe');
  });

  it('opens Signal chat URL only when the body is empty', () => {
    const plan = planDraft('signal', '', '+34611223344');
    assert.equal(plan.kind, 'url');
    if (plan.kind !== 'url') return;
    assert.equal(plan.prefilled, false);
    assert.equal(plan.url, 'https://signal.me/#p/+34611223344');
  });

  it('sends X drafts through ACTION_SEND with the body', () => {
    const plan = planDraft('x', "Hi y'all");
    assert.equal(plan.kind, 'send');
    if (plan.kind !== 'send') return;
    assert.equal(plan.packageName, 'com.twitter.android');
    assert.equal(plan.text, "Hi y'all");
    assert.equal(plan.prefilled, true);
  });
});
