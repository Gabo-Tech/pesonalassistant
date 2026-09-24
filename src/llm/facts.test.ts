import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseReply, spokenChat, toolReplyUsable } from './tools.ts';

describe('parseReply fact tools', () => {
  it('accepts remember_fact', () => {
    const reply = parseReply(
      '{"say": "I will remember that.", "action": {"tool": "remember_fact", "title": "identity", "text": "Name Gabriel, age 29"}}',
    );
    assert.equal(reply.action?.tool, 'remember_fact');
    assert.equal(reply.action?.title, 'identity');
    assert.match(reply.action?.text ?? '', /Gabriel/);
  });

  it('accepts forget_fact', () => {
    const reply = parseReply(
      '{"say": "Forgotten.", "action": {"tool": "forget_fact", "title": "identity"}}',
    );
    assert.equal(reply.action?.tool, 'forget_fact');
    assert.equal(reply.action?.title, 'identity');
  });
});

describe('system prompt', () => {
  it('injects known facts and remember/forget tools', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'prompt.ts'), 'utf8');
    assert.match(src, /formatFactsForPrompt\(facts\)/);
    assert.match(src, /remember_fact/);
    assert.match(src, /forget_fact/);
    assert.match(src, /Lasting personal facts/);
    assert.match(src, /create_alarm/);
    assert.match(src, /list_alarms/);
    assert.match(src, /cancel_alarm/);
  });

  it('keeps the chat prompt free of the tool list', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'prompt.ts'), 'utf8');
    const chat = src.slice(src.indexOf('export function buildChatPrompt'));
    assert.match(chat, /One or two short spoken sentences/);
    assert.doesNotMatch(chat, /create_reminder/);
  });
});

describe('spokenChat', () => {
  it('pulls say out of accidental JSON', () => {
    assert.equal(spokenChat('{"say": "Paris."}'), 'Paris.');
    assert.equal(spokenChat('Paris.'), 'Paris.');
  });
});

describe('toolReplyUsable', () => {
  it('accepts a schema reply and rejects prose', () => {
    assert.equal(
      toolReplyUsable('{"say": "Hi.", "action": {"tool": "none"}}'),
      true,
    );
    assert.equal(toolReplyUsable('Hello there'), false);
    assert.equal(toolReplyUsable('{"say": "Hi."}'), false);
  });
});

describe('parseReply alarm tools', () => {
  it('accepts create_alarm', () => {
    const reply = parseReply(
      '{"say": "Alarm set for 7am.", "action": {"tool": "create_alarm", "when": "7am"}}',
    );
    assert.equal(reply.action?.tool, 'create_alarm');
    assert.equal(reply.action?.when, '7am');
  });
});
