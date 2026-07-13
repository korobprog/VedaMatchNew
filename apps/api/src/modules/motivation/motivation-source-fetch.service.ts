import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { PrismaService } from '../../prisma/prisma.service';
import { MotivationCopyService } from './motivation-copy.service';
import { MotivationGenerationService } from './motivation-generation.service';
import { QuoteDiscoveryService } from './quote-discovery.service';
import { quoteFingerprint } from './quote-normalizer';
import { assertSafeFetchUrl } from './quote-source-policy';

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

@Injectable()
export class MotivationSourceFetchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generation: MotivationGenerationService,
    private readonly discovery: QuoteDiscoveryService,
    private readonly copy: MotivationCopyService,
  ) {}

  async fetchByWatchId(watchId: string): Promise<number> {
    const watch = await this.prisma.motivationSourceWatch.findUnique({ where: { id: watchId } });
    if (!watch) throw new NotFoundException('Source watch not found');

    const text = await this.fetchPageText(watch.url);
    const extracted = await this.generation.extractQuotesFromSource(text, watch.url);

    let ingestedCount = 0;
    for (const item of extracted) {
      const verified = this.discovery.verifyWebCandidate({
        originalText: item.originalText,
        normalizedHash: quoteFingerprint(item.originalText),
        originalLanguage: item.originalLanguage,
        author: item.author,
        work: item.work || watch.label || 'Web source',
        locator: item.locator || watch.url,
        sourceUrl: watch.url,
        contextExcerpt: item.contextExcerpt,
        verified: true,
      });
      if (!verified) continue;
      const quote = await this.discovery.ingestCandidate(verified);
      if (!quote) continue;
      await this.copy.prepareCandidate(quote.id);
      ingestedCount += 1;
    }

    await this.prisma.motivationSourceWatch.update({
      where: { id: watchId },
      data: { lastFetchedAt: new Date(), lastResultCount: ingestedCount },
    });
    return ingestedCount;
  }

  private async fetchPageText(url: string): Promise<string> {
    assertSafeFetchUrl(url);
    const response = await fetch(url, {
      headers: { 'user-agent': 'VedaMatch-Motivation/1.0' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new BadGatewayException(`Source request failed: ${response.status}`);
    assertSafeFetchUrl(response.url || url);
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > MAX_RESPONSE_BYTES) throw new BadGatewayException('Source response exceeds 2 MB');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_RESPONSE_BYTES) throw new BadGatewayException('Source response exceeds 2 MB');
    const html = new TextDecoder().decode(bytes);
    const $ = cheerio.load(html);
    $('script, style, noscript').remove();
    return $('body').text().replace(/\s+/gu, ' ').trim();
  }
}
