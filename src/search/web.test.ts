import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatHits, parseSearchHtml, searchFollowUp } from './web.ts';

const HTML = `
<a class="result__a" href="https://example.com/gold">Gold price today</a>
<a class="result__snippet" href="https://example.com/gold">Spot gold is $2,400 &amp; rising.</a>
<a class="result__a" href="https://example.com/zurich">Events in Zurich</a>
<div>noise</div>
<a class="result__snippet">Concerts next week.</a>
`;

describe('parseSearchHtml', () => {
  it('reads the top titles and snippets', () => {
    const hits = parseSearchHtml(HTML);
    assert.equal(hits.length, 2);
    assert.equal(hits[0].title, 'Gold price today');
    assert.equal(hits[0].snippet, 'Spot gold is $2,400 & rising.');
    assert.equal(hits[1].snippet, 'Concerts next week.');
  });

  it('stops at five results', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      `<a class="result__a">Title ${i}</a><a class="result__snippet">Snippet ${i}</a>`,
    ).join('');
    assert.equal(parseSearchHtml(many).length, 5);
  });
});

describe('searchFollowUp', () => {
  it('asks the model to answer once from the snippets', () => {
    const text = searchFollowUp('price of gold', parseSearchHtml(HTML).slice(0, 1));
    assert.match(text, /price of gold/);
    assert.match(text, /Use tool none/);
    assert.equal(formatHits([]), '');
  });
});
