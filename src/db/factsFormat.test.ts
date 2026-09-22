import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  forgetFactQuery,
  formatFactsForPrompt,
  normalizeFactTitle,
  pickFactToForget,
  rememberFactInput,
} from './factsFormat.ts';

describe('normalizeFactTitle', () => {
  it('lowercases and trims', () => {
    assert.equal(normalizeFactTitle('  Identity  '), 'identity');
  });
});

describe('formatFactsForPrompt', () => {
  it('says none yet when empty', () => {
    assert.equal(formatFactsForPrompt([]), 'Known facts: none yet.');
  });

  it('lists title and text', () => {
    const block = formatFactsForPrompt([{ title: 'identity', text: 'Name Gabriel, age 29' }]);
    assert.match(block, /Known facts:/);
    assert.match(block, /- identity: Name Gabriel, age 29/);
  });
});

describe('rememberFactInput', () => {
  it('defaults the title to identity', () => {
    assert.deepEqual(rememberFactInput({ text: 'Name Gabriel, age 29' }), {
      title: 'identity',
      text: 'Name Gabriel, age 29',
    });
  });

  it('returns null without text', () => {
    assert.equal(rememberFactInput({ title: 'identity' }), null);
  });
});

describe('forgetFactQuery', () => {
  it('prefers title', () => {
    assert.equal(forgetFactQuery({ title: 'identity', text: 'age' }), 'identity');
  });
});

describe('pickFactToForget', () => {
  const facts = [
    { title: 'identity', text: 'Name Gabriel, age 29' },
    { title: 'city', text: 'Lives in Madrid' },
  ];

  it('matches an exact title', () => {
    assert.equal(pickFactToForget(facts, 'Identity')?.title, 'identity');
  });

  it('matches unique wording in the text', () => {
    assert.equal(pickFactToForget(facts, 'age')?.title, 'identity');
  });

  it('returns null when nothing unique matches', () => {
    assert.equal(pickFactToForget(facts, 'unknown'), null);
  });
});
