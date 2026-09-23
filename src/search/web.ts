/**
 * One HTTPS search. The phone does not follow links or crawl the web.
 * DuckDuckGo's HTML results are titles plus snippets.
 */

export type SearchHit = { title: string; snippet: string };

const RESULT =
  /<a[^>]*class="[^"]*result__a[^"]*"[^>]*>([\s\S]*?)<\/a>[\s\S]{0,1200}?<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;

function plain(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseSearchHtml(html: string, limit = 5): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const match of html.matchAll(RESULT)) {
    const title = plain(match[1] ?? '');
    const snippet = plain(match[2] ?? '');
    if (!title) continue;
    hits.push({ title, snippet });
    if (hits.length >= limit) break;
  }
  return hits;
}

export function formatHits(hits: SearchHit[]): string {
  return hits.map((hit, index) => `${index + 1}. ${hit.title}. ${hit.snippet}`).join('\n');
}

/** Second model turn: answer from snippets and do not search again. */
export function searchFollowUp(query: string, hits: SearchHit[]): string {
  return `Web results for "${query}":\n${formatHits(hits)}\nAnswer from these results. Use tool none. Do not search again.`;
}

export async function searchWeb(query: string): Promise<SearchHit[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'text/html',
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
      },
    });
    if (!response.ok) throw new Error(`Search failed (${response.status})`);
    return parseSearchHtml(await response.text());
  } finally {
    clearTimeout(timer);
  }
}
