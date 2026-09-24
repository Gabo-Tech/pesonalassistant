/**
 * One HTTPS lookup. The phone does not follow links or crawl the web.
 * Weather, crypto prices, and news headlines are titles plus snippets.
 */

export type SearchHit = { title: string; snippet: string };

const WEATHER = /\b(weather|forecast|clima)\b|\bque tiempo hace\b/i;
const CRYPTO =
  /\b(btc|bitcoin|eth|ethereum|sol|solana|xrp|doge|dogecoin|ada|cardano|ltc|litecoin|bnb)\b/i;

const PLACE_WORDS =
  /\b(what'?s|what is|whats|how is|hows|the|current|today|tomorrow|like|please|weather|forecast|clima|tiempo|hace|que|en|in|for|at|el|la|de|del|precio|price|of)\b/gi;

export type CoinHit = { id: string; name: string; symbol: string };

function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function plain(html: string): string {
  return html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tagText(block: string, name: string): string {
  const match = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return match?.[1] ?? '';
}

/** Bing News RSS items become the same hit shape the follow-up prompt expects. */
export function parseNewsRss(xml: string, limit = 5): SearchHit[] {
  if (!/<rss[\s>]/i.test(xml) && !/<item[\s>]/i.test(xml)) {
    throw new Error('Search failed (unreadable)');
  }
  const hits: SearchHit[] = [];
  for (const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const title = plain(tagText(match[1] ?? '', 'title'));
    const snippet = plain(tagText(match[1] ?? '', 'description'));
    if (!title) continue;
    hits.push({ title, snippet });
    if (hits.length >= limit) break;
  }
  return hits;
}

/** Place left after weather words are stripped. Empty means "here". */
export function weatherPlace(query: string): string {
  PLACE_WORDS.lastIndex = 0;
  return fold(query).replace(/[?¿!¡.,]/g, ' ').replace(PLACE_WORDS, ' ').replace(/\s+/g, ' ').trim();
}

export function pickCoin(coins: CoinHit[], token: string): CoinHit | null {
  const want = token.toLowerCase();
  return (
    coins.find(
      (coin) =>
        coin.symbol.toLowerCase() === want ||
        coin.id.toLowerCase() === want ||
        coin.name.toLowerCase() === want,
    ) ??
    coins[0] ??
    null
  );
}

export function formatUsd(amount: number): string {
  const rounded = Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2);
  const [whole, fraction] = rounded.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `$${grouped}.${fraction}` : `$${grouped}`;
}

export function formatCryptoHit(coin: CoinHit, usd: number): SearchHit {
  const label = `${coin.name} (${coin.symbol.toUpperCase()})`;
  return { title: label, snippet: `${label}: ${formatUsd(usd)} USD` };
}

export function formatHits(hits: SearchHit[]): string {
  return hits.map((hit, index) => `${index + 1}. ${hit.title}. ${hit.snippet}`).join('\n');
}

/** Second model turn: answer from snippets and do not search again. */
export function searchFollowUp(query: string, hits: SearchHit[]): string {
  return `Web results for "${query}":\n${formatHits(hits)}\nAnswer from these results. Use tool none. Do not search again.`;
}

async function readOk(url: string, signal: AbortSignal, accept: string): Promise<string> {
  const response = await fetch(url, {
    signal,
    headers: { Accept: accept, 'User-Agent': 'Micro/1.0' },
  });
  if (response.status !== 200) throw new Error(`Search failed (${response.status})`);
  return response.text();
}

async function fetchWeather(query: string, signal: AbortSignal): Promise<SearchHit | null> {
  const place = weatherPlace(query);
  const path = place ? encodeURIComponent(place) : '';
  const line = (await readOk(`https://wttr.in/${path}?format=3`, signal, 'text/plain')).trim();
  if (!line || /unknown location/i.test(line)) return null;
  return { title: place || 'Weather', snippet: line };
}

async function fetchCrypto(query: string, signal: AbortSignal): Promise<SearchHit | null> {
  const token = query.match(CRYPTO)?.[1] ?? '';
  if (!token) return null;
  const searchBody = await readOk(
    `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(token)}`,
    signal,
    'application/json',
  );
  const parsed = JSON.parse(searchBody) as { coins?: CoinHit[] };
  const coin = pickCoin(parsed.coins ?? [], token);
  if (!coin?.id) return null;
  const priceBody = await readOk(
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coin.id)}&vs_currencies=usd`,
    signal,
    'application/json',
  );
  const prices = JSON.parse(priceBody) as Record<string, { usd?: number }>;
  const usd = prices[coin.id]?.usd;
  if (typeof usd !== 'number') return null;
  return formatCryptoHit(coin, usd);
}

async function fetchNews(query: string, signal: AbortSignal, limit: number): Promise<SearchHit[]> {
  const xml = await readOk(
    `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=RSS`,
    signal,
    'application/rss+xml, application/xml, text/xml',
  );
  return parseNewsRss(xml, limit);
}

export async function searchWeb(query: string): Promise<SearchHit[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const hits: SearchHit[] = [];
  let primaryError: unknown = null;
  try {
    try {
      if (WEATHER.test(fold(query))) {
        const weather = await fetchWeather(query, controller.signal);
        if (weather) hits.push(weather);
      } else if (CRYPTO.test(query)) {
        const price = await fetchCrypto(query, controller.signal);
        if (price) hits.push(price);
      }
    } catch (error) {
      primaryError = error;
    }

    try {
      const news = await fetchNews(query, controller.signal, 5 - hits.length);
      hits.push(...news);
    } catch (error) {
      if (hits.length === 0) throw primaryError ?? error;
    }

    if (hits.length === 0 && primaryError) throw primaryError;
    return hits.slice(0, 5);
  } finally {
    clearTimeout(timer);
  }
}
