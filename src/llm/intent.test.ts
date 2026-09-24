import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { looksLikeTask } from './intent.ts';

describe('looksLikeTask', () => {
  it('keeps greetings and known-fact questions on the chat path', () => {
    assert.equal(looksLikeTask('hello'), false);
    assert.equal(looksLikeTask("what's my name?"), false);
    assert.equal(looksLikeTask('how old am I'), false);
    assert.equal(looksLikeTask('what is the capital of France'), false);
    assert.equal(looksLikeTask('cómo me llamo'), false);
    assert.equal(looksLikeTask('tell me a joke'), false);
  });

  it('sends reminders, notes, alarms, messages, calendar, and search to tools', () => {
    assert.equal(looksLikeTask('remind me to call mum tomorrow at 9'), true);
    assert.equal(looksLikeTask('note that the wifi password is hunter2'), true);
    assert.equal(looksLikeTask('set an alarm for 7am'), true);
    assert.equal(looksLikeTask("what's on my calendar tomorrow"), true);
    assert.equal(looksLikeTask('how is my week'), true);
    assert.equal(looksLikeTask("what's the price of gold?"), true);
    assert.equal(looksLikeTask('recuérdame llamar a mamá'), true);
    assert.equal(looksLikeTask('qué tiempo hace'), true);
    assert.equal(looksLikeTask('qué hay en el calendario'), true);
    assert.equal(looksLikeTask('schedule lunch Friday'), true);
    assert.equal(looksLikeTask('move the dentist to 4'), true);
    assert.equal(looksLikeTask('change the milk task'), true);
    assert.equal(looksLikeTask('send Marie I am late'), true);
    assert.equal(looksLikeTask("Publish this post on X 'Hi y'all'"), true);
    assert.equal(looksLikeTask('post on twitter hello'), true);
  });
});
