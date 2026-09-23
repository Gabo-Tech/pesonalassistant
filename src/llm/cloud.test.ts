import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cloudReplyText, cloudRequest, safeCloudLog } from './cloud.ts';

const secret = 'sk-test-secret-should-not-log';

describe('cloudRequest', () => {
  const messages = [
    { role: 'system' as const, content: 'Reply with JSON only.' },
    { role: 'user' as const, content: 'hello' },
  ];

  it('keeps the key in a header and out of the URL, body, and log line', () => {
    for (const provider of ['openai', 'anthropic', 'gemini', 'openrouter'] as const) {
      const request = cloudRequest({ provider, model: '', apiKey: secret, messages });
      assert.equal(request.url.includes(secret), false);
      assert.equal(request.body.includes(secret), false);
      assert.equal(safeCloudLog(request).includes(secret), false);
      assert.ok(Object.values(request.headers).some((value) => value.includes(secret)));
    }
  });

  it('uses each provider URL', () => {
    assert.match(cloudRequest({ provider: 'openai', model: 'gpt-4o-mini', apiKey: secret, messages }).url, /api\.openai\.com/);
    assert.match(
      cloudRequest({ provider: 'anthropic', model: 'claude-3-5-haiku-latest', apiKey: secret, messages }).url,
      /api\.anthropic\.com/,
    );
    assert.match(
      cloudRequest({ provider: 'gemini', model: 'gemini-2.0-flash', apiKey: secret, messages }).url,
      /generativelanguage\.googleapis\.com/,
    );
    assert.match(
      cloudRequest({ provider: 'openrouter', model: 'openai/gpt-4o-mini', apiKey: secret, messages }).url,
      /openrouter\.ai/,
    );
  });

  it('reads the assistant text back', () => {
    assert.equal(
      cloudReplyText('openai', { choices: [{ message: { content: '{"say":"Hi","action":{"tool":"none"}}' } }] }),
      '{"say":"Hi","action":{"tool":"none"}}',
    );
    assert.equal(cloudReplyText('anthropic', { content: [{ text: 'hola' }] }), 'hola');
    assert.equal(
      cloudReplyText('gemini', { candidates: [{ content: { parts: [{ text: 'listo' }] } }] }),
      'listo',
    );
  });
});
