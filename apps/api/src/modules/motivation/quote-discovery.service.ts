import { Injectable } from '@nestjs/common';
import { Prisma, type MotivationQuote } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { VedabaseContentRepository } from '../vedabase/vedabase-content.repository';
import { ApprovedWebSourceService, type WebQuoteCandidate } from './approved-web-source.service';
import { extractQuoteSentence, quoteFingerprint } from './quote-normalizer';
import { QuoteVerificationService, type VerifiedQuote } from './quote-verification.service';

const DISCOVERY_QUERIES = ['жизнь or мудрость or цель or служение or сострадание or мужество or покой or истина'];

export type IngestableQuoteCandidate = VerifiedQuote | NonNullable<ReturnType<QuoteDiscoveryService['verifyWebCandidate']>>;

@Injectable()
export class QuoteDiscoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: VedabaseContentRepository,
    private readonly verifier: QuoteVerificationService,
    private readonly web: ApprovedWebSourceService,
  ) {}

  async discoverDaily(date: Date, count = 8): Promise<MotivationQuote[]> {
    if (count < 1) return [];
    const discoveryDate = new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
    const dailyQuotes = await this.prisma.motivationQuote.findMany({
      where: { discoveryDate, verified: true },
      orderBy: { createdAt: 'asc' },
      take: count,
    });
    if (dailyQuotes.length >= count) return dailyQuotes;

    const missingCount = count - dailyQuotes.length;
    const candidates = new Map<string, VerifiedQuote | ReturnType<typeof this.verifyWebCandidate>>();

    for (const query of DISCOVERY_QUERIES) {
      const units = await this.repository.findQuoteCandidates(query, missingCount * 4);
      for (const unit of units) {
        const originalText = extractQuoteSentence(unit.text);
        if (!originalText) continue;
        try {
          const verified = await this.verifier.verifyVedabaseCandidate({
            bookSlug: unit.bookSlug, chapterSlug: unit.chapterSlug, originalText,
          });
          candidates.set(verified.normalizedHash, verified);
        } catch {
          continue;
        }
      }
    }

    const internalExisting = await this.findExistingHashes([...candidates.keys()]);
    const freshInternalCount = [...candidates.keys()].filter((hash) => !internalExisting.has(hash)).length;
    if (freshInternalCount < missingCount) {
      const webResults = await this.web.search(DISCOVERY_QUERIES.join(' '), (missingCount - freshInternalCount) * 4);
      for (const result of webResults) {
        const verified = this.verifyWebCandidate(result);
        if (verified) candidates.set(verified.normalizedHash, verified);
        if (candidates.size >= missingCount) break;
      }
    }

    const existingHashes = await this.findExistingHashes([...candidates.keys()]);
    const selected = [...candidates.entries()]
      .filter(([hash, candidate]) => candidate && !existingHashes.has(hash))
      .map(([, candidate]) => candidate)
      .slice(0, missingCount) as Array<VerifiedQuote | NonNullable<ReturnType<typeof this.verifyWebCandidate>>>;
    if (selected.length !== missingCount) throw new Error('insufficient_verified_quotes');

    return this.prisma.$transaction(async (transaction) => {
      const currentBatch = await transaction.motivationQuote.findMany({
        where: { discoveryDate, verified: true },
        orderBy: { createdAt: 'asc' },
        take: count,
      });
      const stillMissing = count - currentBatch.length;
      if (stillMissing <= 0) return currentBatch;
      if (selected.length < stillMissing) throw new Error('insufficient_verified_quotes');

      await transaction.motivationQuote.createMany({
        data: selected.slice(0, stillMissing).map((candidate) => ({ ...candidate, discoveryDate })),
        skipDuplicates: true,
      });
      const batch = await transaction.motivationQuote.findMany({
        where: { discoveryDate, verified: true },
        orderBy: { createdAt: 'asc' },
        take: count,
      });
      if (batch.length !== count) throw new Error('insufficient_verified_quotes');
      return batch;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async findExistingHashes(hashes: string[]): Promise<Set<string>> {
    if (!hashes.length) return new Set();
    const existing = await this.prisma.motivationQuote.findMany({
      where: { normalizedHash: { in: hashes } },
      select: { normalizedHash: true },
    });
    return new Set(existing.map((quote) => quote.normalizedHash));
  }

  async ingestCandidate(candidate: IngestableQuoteCandidate): Promise<MotivationQuote | null> {
    const existing = await this.prisma.motivationQuote.findUnique({ where: { normalizedHash: candidate.normalizedHash } });
    if (existing) return null;
    return this.prisma.motivationQuote.create({ data: { ...candidate, discoveryDate: null } });
  }

  verifyWebCandidate(candidate: WebQuoteCandidate) {
    if (!candidate.verified || !candidate.sourceUrl || !candidate.author) return null;
    if (!candidate.contextExcerpt.includes(candidate.originalText)) return null;
    return {
      originalText: candidate.originalText,
      normalizedHash: candidate.normalizedHash || quoteFingerprint(candidate.originalText),
      originalLanguage: candidate.originalLanguage || 'en',
      author: candidate.author,
      work: candidate.work,
      locator: candidate.locator,
      sourceType: 'approved_web' as const,
      sourceUrl: candidate.sourceUrl,
      vedabaseBookSlug: null,
      vedabaseChapterSlug: null,
      contextExcerpt: candidate.contextExcerpt,
      verified: true as const,
      verifiedAt: new Date(),
    };
  }
}
