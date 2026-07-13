import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { VedabaseContentRepository } from '../vedabase/vedabase-content.repository';
import { ApprovedWebSourceService } from './approved-web-source.service';
import { MotivationCopyService } from './motivation-copy.service';
import { extractQuoteSentence } from './quote-normalizer';
import { QuoteDiscoveryService } from './quote-discovery.service';
import { QuoteVerificationService } from './quote-verification.service';

const MIN_INTERNAL_RESULTS_BEFORE_WEB = 5;
const INTERNAL_SEARCH_LIMIT = 40;
const WEB_SEARCH_LIMIT = 20;

@Injectable()
export class MotivationAuthorSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: VedabaseContentRepository,
    private readonly verifier: QuoteVerificationService,
    private readonly web: ApprovedWebSourceService,
    private readonly discovery: QuoteDiscoveryService,
    private readonly copy: MotivationCopyService,
  ) {}

  async searchByWatchId(watchId: string): Promise<number> {
    const watch = await this.prisma.motivationAuthorWatch.findUnique({ where: { id: watchId } });
    if (!watch) throw new NotFoundException('Author watch not found');
    const authorName = watch.name.trim();
    const normalizedAuthor = authorName.toLocaleLowerCase();
    let ingestedCount = 0;

    const units = await this.repository.findQuoteCandidates(authorName, INTERNAL_SEARCH_LIMIT);
    for (const unit of units) {
      if (!unit.bookAuthor?.toLocaleLowerCase().includes(normalizedAuthor)) continue;
      const originalText = extractQuoteSentence(unit.text);
      if (!originalText) continue;
      try {
        const verified = await this.verifier.verifyVedabaseCandidate({
          bookSlug: unit.bookSlug,
          chapterSlug: unit.chapterSlug,
          originalText,
        });
        if (await this.ingest(verified)) ingestedCount += 1;
      } catch {
        continue;
      }
    }

    if (ingestedCount < MIN_INTERNAL_RESULTS_BEFORE_WEB) {
      const webResults = await this.web.search(authorName, WEB_SEARCH_LIMIT);
      for (const candidate of webResults) {
        if (!candidate.author.toLocaleLowerCase().includes(normalizedAuthor)) continue;
        const verified = this.discovery.verifyWebCandidate(candidate);
        if (!verified) continue;
        if (await this.ingest(verified)) ingestedCount += 1;
      }
    }

    await this.prisma.motivationAuthorWatch.update({
      where: { id: watchId },
      data: { lastSearchedAt: new Date(), lastResultCount: ingestedCount },
    });
    return ingestedCount;
  }

  private async ingest(candidate: Parameters<QuoteDiscoveryService['ingestCandidate']>[0]): Promise<boolean> {
    const quote = await this.discovery.ingestCandidate(candidate);
    if (!quote) return false;
    await this.copy.prepareCandidate(quote.id);
    return true;
  }
}
