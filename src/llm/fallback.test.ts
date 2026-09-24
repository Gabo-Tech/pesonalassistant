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

  it('sets a reminder for noon and right after an appointment', () => {
    const noon = fallbackAsk('remind me to eat tomorrow at noon');
    assert.equal(noon.action?.tool, 'create_reminder');
    assert.match(noon.action?.when ?? '', /tomorrow at noon/i);

    const after = fallbackAsk('remind me to call mum right after the dentist');
    assert.equal(after.action?.tool, 'create_reminder');
    assert.equal(after.action?.text, 'call mum');
    assert.match(after.action?.when ?? '', /right after the dentist/i);
  });

  it('adds a task and summarizes the week without a model', () => {
    const task = fallbackAsk('add a task to buy milk');
    assert.equal(task.action?.tool, 'create_task');
    assert.match(task.action?.title ?? '', /buy milk/i);

    const week = fallbackAsk('how is my week');
    assert.equal(week.action?.tool, 'brief');
    assert.equal(week.action?.when, 'this week');

    const spanish = fallbackAsk('qué tengo esta semana', 'es');
    assert.equal(spanish.action?.tool, 'brief');
    assert.equal(spanish.action?.when, 'this week');
  });

  it('routes a message, a call, and a saved contact', () => {
    const message = fallbackAsk("message Marie I'm running late");
    assert.equal(message.action?.tool, 'message_contact');
    assert.equal(message.action?.recipient, 'Marie');

    const call = fallbackAsk('call Marie');
    assert.equal(call.action?.tool, 'call_contact');

    const saved = fallbackAsk('add contact Marie WhatsApp +34611223344');
    assert.equal(saved.action?.tool, 'create_contact');
    assert.equal(saved.action?.title, 'Marie');
    assert.equal(saved.action?.query, 'whatsapp');

    const event = fallbackAsk('add an event dentist every Tuesday at 3');
    assert.equal(event.action?.tool, 'create_event');
    assert.match(event.action?.when ?? '', /every Tuesday/i);
  });

  it('explains itself when it does not understand', () => {
    const reply = fallbackAsk('what is the meaning of life');
    assert.equal(reply.action, undefined);
    assert.match(reply.say, /Settings/);
  });

  it('files, pins, and colors notes without a model', () => {
    const filed = fallbackAsk('put the wifi note in Work');
    assert.equal(filed.action?.tool, 'file_note');
    assert.equal(filed.action?.title, 'wifi');
    assert.equal(filed.action?.text, 'Work');

    const pinned = fallbackAsk('pin the shopping note');
    assert.equal(pinned.action?.tool, 'mark_note');
    assert.equal(pinned.action?.title, 'shopping');
    assert.equal(pinned.action?.text, 'pin');

    const colored = fallbackAsk('highlight the shopping note yellow');
    assert.equal(colored.action?.tool, 'mark_note');
    assert.equal(colored.action?.text, 'amber');

    const created = fallbackAsk('note in Work that the wifi password is hunter2');
    assert.equal(created.action?.tool, 'create_note');
    assert.equal(created.action?.query, 'Work');
    assert.match(created.action?.text ?? '', /hunter2/);

    const spanish = fallbackAsk('pon la nota wifi en Trabajo', 'es');
    assert.equal(spanish.action?.tool, 'file_note');
    assert.equal(spanish.action?.title, 'wifi');
    assert.equal(spanish.action?.text, 'Trabajo');
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
