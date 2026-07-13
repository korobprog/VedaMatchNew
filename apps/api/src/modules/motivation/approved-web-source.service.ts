import { Injectable } from '@nestjs/common';
import { normalizeQuote, quoteFingerprint } from './quote-normalizer';
import { assertApprovedSource } from './quote-source-policy';

export interface WebQuoteCandidate {
  originalText: string;
  normalizedHash: string;
  originalLanguage: string;
  author: string;
  work: string;
  locator: string;
  sourceUrl: string;
  contextExcerpt: string;
  verified: boolean;
}

export interface ApprovedWebSearchProvider {
  search(query: string, limit: number): Promise<WebQuoteCandidate[]>;
}

interface WikiquoteSearchResponse {
  query?: { search?: Array<{ title?: string; snippet?: string; pageid?: number }> };
}

interface WikiquoteParseResponse {
  parse?: { title?: string; pageid?: number; wikitext?: { '*': string } };
}

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

@Injectable()
export class ApprovedWebSourceService implements ApprovedWebSearchProvider {
  async search(query: string, limit: number): Promise<WebQuoteCandidate[]> {
    const url = new URL('https://en.wikiquote.org/w/api.php');
    url.search = new URLSearchParams({
      action: 'query', list: 'search', format: 'json', origin: '*',
      srsearch: query, srlimit: String(Math.max(1, Math.min(limit, 50))),
    }).toString();
    assertApprovedSource(url.toString());

    const payload = await this.fetchJson<WikiquoteSearchResponse>(url);
    const candidates: WebQuoteCandidate[] = [];
    for (const result of payload.query?.search ?? []) {
      if (!result.pageid) continue;
      const parseUrl = new URL('https://en.wikiquote.org/w/api.php');
      parseUrl.search = new URLSearchParams({
        action: 'parse', pageid: String(result.pageid), prop: 'wikitext', format: 'json', origin: '*',
      }).toString();
      const parsed = await this.fetchJson<WikiquoteParseResponse>(parseUrl);
      const author = this.decodeEntities(parsed.parse?.title ?? result.title ?? '').trim();
      if (!author) continue;
      const sourceUrl = `https://en.wikiquote.org/wiki/${encodeURIComponent(author.replace(/ /g, '_'))}`;
      for (const quote of this.extractQuoteEntries(parsed.parse?.wikitext?.['*'] ?? '')) {
        candidates.push({
          originalText: quote,
          normalizedHash: quoteFingerprint(quote),
          originalLanguage: 'en',
          author,
          work: 'Wikiquote',
          locator: `page:${result.pageid}`,
          sourceUrl,
          contextExcerpt: quote,
          verified: true,
        });
        if (candidates.length >= limit) return candidates;
      }
    }
    return candidates;
  }

  private async fetchJson<T>(url: URL): Promise<T> {
    assertApprovedSource(url.toString());
    const response = await fetch(url, {
      headers: { 'User-Agent': 'VedaMatch-Motivation/1.0' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Approved source request failed: ${response.status}`);
    assertApprovedSource(response.url || url.toString());
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > MAX_RESPONSE_BYTES) throw new Error('Approved source response exceeds 2 MB');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_RESPONSE_BYTES) throw new Error('Approved source response exceeds 2 MB');
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  }

  private extractQuoteEntries(wikitext: string): string[] {
    return wikitext.split(/\r?\n/u)
      .filter((line) => line.startsWith('* ') && !/^\*\s*(?:category:|file:|image:|isbn|source:)/iu.test(line))
      .map((line) => this.cleanWikiMarkup(line.slice(2)))
      .filter((line) => line.length >= 20 && line.length <= 2_000);
  }

  private cleanWikiMarkup(value: string): string {
    return this.decodeEntities(value)
      .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>|<ref\b[^>]*\/>/giu, '')
      .replace(/\{\{[^{}]*\}\}/gu, '')
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/gu, '$2')
      .replace(/\[\[([^\]]+)\]\]/gu, '$1')
      .replace(/\[https?:\/\/\S+\s+([^\]]+)\]/gu, '$1')
      .replace(/'{2,5}/gu, '')
      .replace(/<[^>]*>/gu, ' ')
      .replace(/\s+/gu, ' ')
      .trim();
  }

  private decodeEntities(value: string): string {
    return value
      .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
  }
}
