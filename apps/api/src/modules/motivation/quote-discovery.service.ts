import { Injectable } from '@nestjs/common';
import type { MotivationQuote } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { VedabaseContentRepository } from '../vedabase/vedabase-content.repository';
import { ApprovedWebSourceService, type WebQuoteCandidate } from './approved-web-source.service';
import { quoteFingerprint } from './quote-normalizer';
import { QuoteVerificationService, type VerifiedQuote } from './quote-verification.service';

const DISCOVERY_QUERIES = ['life wisdom purpose service compassion courage peace truth'];

@Injectable()
export class QuoteDiscoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: VedabaseContentRepository,
    private readonly verifier: QuoteVerificationService,
    private readonly web: ApprovedWebSourceService,
  ) {}

  async discoverDaily(_date: Date, count = 8): Promise<MotivationQuote[]> {
    if (count < 1) return [];
    const candidates = new Map<string, VerifiedQuote | ReturnType<typeof this.verifyWebCandidate>>();

    for (const query of DISCOVERY_QUERIES) {
      const units = await this.repository.findQuoteCandidates(query, count * 4);
      for (const unit of units) {
        const originalText = this.extractQuote(unit.text);
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
    if (freshInternalCount < count) {
      const webResults = await this.web.search(DISCOVERY_QUERIES.join(' '), (count - freshInternalCount) * 4);
      for (const result of webResults) {
        const verified = this.verifyWebCandidate(result);
        if (verified) candidates.set(verified.normalizedHash, verified);
        if (candidates.size >= count) break;
      }
    }

    const existingHashes = await this.findExistingHashes([...candidates.keys()]);
    const selected = [...candidates.entries()]
      .filter(([hash, candidate]) => candidate && !existingHashes.has(hash))
      .map(([, candidate]) => candidate)
      .slice(0, count) as Array<VerifiedQuote | NonNullable<ReturnType<typeof this.verifyWebCandidate>>>;
    if (selected.length !== count) throw new Error('insufficient_verified_quotes');

    return this.prisma.$transaction(async (transaction) => {
      const hashes = selected.map((candidate) => candidate.normalizedHash);
      await transaction.motivationQuote.createMany({ data: selected, skipDuplicates: true });
      const saved = await transaction.motivationQuote.findMany({ where: { normalizedHash: { in: hashes }, verified: true } });
      if (saved.length !== count) throw new Error('insufficient_verified_quotes');
      return saved;
    });
  }

  private async findExistingHashes(hashes: string[]): Promise<Set<string>> {
    if (!hashes.length) return new Set();
    const existing = await this.prisma.motivationQuote.findMany({
      where: { normalizedHash: { in: hashes } },
      select: { normalizedHash: true },
    });
    return new Set(existing.map((quote) => quote.normalizedHash));
  }

  private extractQuote(text: string): string | null {
    const sentence = text.split(/(?<=[.!?])\s+/u).map((part) => part.trim()).find((part) => part.length >= 20 && part.length <= 500);
    return sentence ?? (text.length > 0 && text.length <= 500 ? text.trim() : null);
  }

  private verifyWebCandidate(candidate: WebQuoteCandidate) {
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
