import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatCryptoHit,
  formatHits,
  formatUsd,
  parseNewsRss,
  pickCoin,
  searchFollowUp,
  weatherPlace,
} from './web.ts';

const RSS = `
<rss><channel>
<item><title>Gold price today</title><description>Spot gold is $2,400 &amp; rising.</description></item>
<item><title>Events in Zurich</title><description>Concerts next week.</description></item>
<item><title>Encoded &#252;</title><description><![CDATA[A <b>snippet</b>]]></description></item>
</channel></rss>
`;

describe('parseNewsRss', () => {
  it('reads titles and snippets', () => {
    const hits = parseNewsRss(RSS);
    assert.equal(hits.length, 3);
    assert.equal(hits[0].title, 'Gold price today');
    assert.equal(hits[0].snippet, 'Spot gold is $2,400 & rising.');
    assert.equal(hits[1].snippet, 'Concerts next week.');
    assert.equal(hits[2].title, 'Encoded ü');
    assert.equal(hits[2].snippet, 'A snippet');
  });

  it('stops at five results', () => {
    const many = `<rss>${Array.from({ length: 8 }, (_, i) => `<item><title>Title ${i}</title><description>Snippet ${i}</description></item>`).join('')}</rss>`;
    assert.equal(parseNewsRss(many).length, 5);
  });

  it('rejects a page that is not a feed', () => {
    assert.throws(() => parseNewsRss('<html>bots use this too</html>'), /unreadable/);
  });
});

describe('weather and crypto helpers', () => {
  it('keeps the place and drops weather words', () => {
    assert.equal(weatherPlace("What's the weather in Zurich?"), 'zurich');
    assert.equal(weatherPlace('qué tiempo hace en Madrid'), 'madrid');
    assert.equal(weatherPlace('weather'), '');
  });

  it('prefers an exact coin symbol and formats the price', () => {
    const coin = pickCoin(
      [
        { id: 'bitget-wrapped-btc', name: 'Wrapped', symbol: 'BGBTC' },
        { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC' },
      ],
      'btc',
    );
    assert.equal(coin?.id, 'bitcoin');
    assert.equal(formatUsd(84246), '$84,246');
    assert.equal(formatUsd(0.5), '$0.50');
    assert.equal(formatCryptoHit(coin!, 84246).snippet, 'Bitcoin (BTC): $84,246 USD');
  });
});

describe('searchFollowUp', () => {
  it('asks the model to answer once from the snippets', () => {
    const text = searchFollowUp('price of gold', parseNewsRss(RSS).slice(0, 1));
    assert.match(text, /price of gold/);
    assert.match(text, /Use tool none/);
    assert.equal(formatHits([]), '');
  });
});
