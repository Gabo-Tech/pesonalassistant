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

  it('creates an alarm, not a reminder', () => {
    const reply = fallbackAsk('set an alarm for 7am');
    assert.equal(reply.action?.tool, 'create_alarm');
    assert.match(reply.action?.when ?? '', /7am/i);
  });

  it('creates a daily alarm from wake me', () => {
    const reply = fallbackAsk('wake me every day at 7am');
    assert.equal(reply.action?.tool, 'create_alarm');
    assert.match(reply.action?.when ?? '', /every day/i);
  });

  it('cancels an alarm by time', () => {
    const reply = fallbackAsk('cancel the 7am alarm');
    assert.equal(reply.action?.tool, 'cancel_alarm');
    assert.match(reply.action?.text ?? '', /7am/i);
  });

  it('drafts a whatsapp', () => {
    const reply = fallbackAsk("tell marie on whatsapp that I'm running late");
    assert.equal(reply.action?.tool, 'draft_whatsapp');
    assert.equal(reply.action?.recipient, 'marie');
    assert.match(reply.action?.text ?? '', /running late/i);
  });

  it('creates an event from a spoken line', () => {
    const reply = fallbackAsk('add an event dentist tomorrow at 9');
    assert.equal(reply.action?.tool, 'create_event');
    assert.match(reply.action?.title ?? '', /dentist/i);
    const spanish = fallbackAsk('añade dentista al calendario', 'es');
    assert.equal(spanish.action?.tool, 'create_event');
  });

  it('explains itself when it does not understand', () => {
    const reply = fallbackAsk('what is the meaning of life');
    assert.equal(reply.action, undefined);
    assert.match(reply.say, /Settings/);
  });

  it('creates a Spanish note, alarm, and reminder', () => {
    const note = fallbackAsk('anota que la wifi es hunter2', 'es');
    assert.equal(note.action?.tool, 'create_note');
    assert.match(note.action?.text ?? '', /hunter2/);

    const alarm = fallbackAsk('pon una alarma a las 7am', 'es');
    assert.equal(alarm.action?.tool, 'create_alarm');

    const reminder = fallbackAsk('recuérdame llamar a mamá mañana a las 9', 'es');
    assert.equal(reminder.action?.tool, 'create_reminder');
    assert.match(reminder.action?.when ?? '', /mañana/i);
  });
});
