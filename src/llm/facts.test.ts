import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseReply } from './tools.ts';

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
  });
});
