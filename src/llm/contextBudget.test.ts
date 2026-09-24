import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fitMessages, promptBudget, shrinkToSystemUser, type ChatMessage } from './contextBudget.ts';

/** One token per character, so the budget is easy to see in the assertions. */
function count(messages: ChatMessage[]): number {
  return messages.reduce((total, message) => total + message.content.length, 0);
}

const system: ChatMessage = { role: 'system', content: 'sys' };

describe('fitMessages', () => {
  it('drops the stored copy of the utterance being sent', async () => {
    const fitted = await fitMessages(
      [
        system,
        { role: 'user', content: 'earlier' },
        { role: 'assistant', content: 'ok' },
        { role: 'user', content: 'remind me' },
        { role: 'user', content: 'remind me' },
      ],
      100,
      count,
    );
    assert.deepEqual(
      fitted.map((message) => message.content),
      ['sys', 'earlier', 'ok', 'remind me'],
    );
  });

  it('drops the oldest turns until the prompt fits', async () => {
    const fitted = await fitMessages(
      [
        system,
        { role: 'user', content: 'one' },
        { role: 'assistant', content: 'two' },
        { role: 'user', content: 'three' },
        { role: 'user', content: 'now' },
      ],
      11,
      count,
    );
    assert.deepEqual(
      fitted.map((message) => message.content),
      ['sys', 'three', 'now'],
    );
  });

  it('shortens the utterance from the end when history is already gone', async () => {
    const fitted = await fitMessages(
      [system, { role: 'user', content: 'abcdefghij' }],
      8,
      count,
    );
    assert.deepEqual(
      fitted.map((message) => message.content),
      ['sys', 'abcde'],
    );
  });

  it('leaves a different stored question in place', async () => {
    const fitted = await fitMessages(
      [
        system,
        { role: 'user', content: 'what time is it' },
        { role: 'user', content: 'set an alarm' },
      ],
      100,
      count,
    );
    assert.equal(fitted.length, 3);
    assert.equal(fitted[1].content, 'what time is it');
  });
});

describe('shrinkToSystemUser', () => {
  it('keeps the system line and the first half of the utterance', () => {
    const shrunk = shrinkToSystemUser([
      system,
      { role: 'assistant', content: 'old' },
      { role: 'user', content: 'abcdefgh' },
    ]);
    assert.deepEqual(
      shrunk.map((message) => message.content),
      ['sys', 'abcd'],
    );
  });
});

describe('promptBudget', () => {
  it('reserves the reply and a margin inside the 4096 window', () => {
    assert.equal(promptBudget(128), 4096 - 128 - 32);
  });
});
