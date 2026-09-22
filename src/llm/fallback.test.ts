import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fallbackAsk } from './fallback.ts';

describe('fallbackAsk', () => {
  it('remembers packed identity facts', () => {
    const reply = fallbackAsk("I'm Gabriel and I'm 29");
    assert.equal(reply.action?.tool, 'remember_fact');
    assert.equal(reply.action?.title, 'identity');
    assert.match(reply.action?.text ?? '', /Gabriel/);
    assert.match(reply.action?.text ?? '', /29/);
  });

  it('remembers "remember that I\'m …"', () => {
    const reply = fallbackAsk("remember that I'm Gabriel");
    assert.equal(reply.action?.tool, 'remember_fact');
    assert.match(reply.action?.text ?? '', /Gabriel/);
  });

  it('forgets a fact by title', () => {
    const reply = fallbackAsk('forget my age');
    assert.equal(reply.action?.tool, 'forget_fact');
    assert.equal(reply.action?.title, 'age');
  });

  it('still notes wifi passwords', () => {
    const remember = fallbackAsk('remember that the wifi password is hunter2');
    assert.equal(remember.action?.tool, 'create_note');

    const reply = fallbackAsk('note that the wifi password is hunter2');
    assert.equal(reply.action?.tool, 'create_note');
    assert.match(reply.action?.text ?? '', /hunter2/);
  });

  it('creates a reminder', () => {
    const reply = fallbackAsk('remind me to call mum tomorrow at 9');
    assert.equal(reply.action?.tool, 'create_reminder');
    assert.equal(reply.action?.when, 'tomorrow at 9');
  });

  it('drafts a whatsapp', () => {
    const reply = fallbackAsk("tell marie on whatsapp that I'm running late");
    assert.equal(reply.action?.tool, 'draft_whatsapp');
    assert.equal(reply.action?.recipient, 'marie');
    assert.match(reply.action?.text ?? '', /running late/i);
  });

  it('explains itself when it does not understand', () => {
    const reply = fallbackAsk('what is the meaning of life');
    assert.equal(reply.action, undefined);
    assert.match(reply.say, /Settings/);
  });
});
