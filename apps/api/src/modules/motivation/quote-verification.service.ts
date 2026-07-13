import { Injectable } from '@nestjs/common';
import type { VedabaseLocator } from '@vedamatch/shared';
import { VedabaseContentRepository, type VedabaseQuoteSearchUnit } from '../vedabase/vedabase-content.repository';
import { normalizeQuote, quoteFingerprint } from './quote-normalizer';

export interface VedabaseQuoteCandidate {
  bookSlug: string;
  chapterSlug: string;
  originalText: string;
}

export interface VerifiedQuote {
  originalText: string;
  normalizedHash: string;
  originalLanguage: string;
  author: string;
  work: string;
  locator: string;
  sourceType: 'vedamatch_library';
  sourceUrl: null;
  vedabaseBookSlug: string;
  vedabaseChapterSlug: string;
  contextExcerpt: string;
  verified: true;
  verifiedAt: Date;
}

@Injectable()
export class QuoteVerificationService {
  constructor(private readonly repository: VedabaseContentRepository) {}

  async verifyVedabaseCandidate(candidate: VedabaseQuoteCandidate): Promise<VerifiedQuote> {
    const units = await this.repository.findQuoteCandidates(candidate.originalText, 50);
    const normalizedQuote = normalizeQuote(candidate.originalText);
    const unit = units.find((item) =>
      item.bookSlug === candidate.bookSlug
      && item.chapterSlug === candidate.chapterSlug
      && normalizeQuote(item.text).includes(normalizedQuote),
    );

    if (!normalizedQuote || !unit) throw new Error('Quote not found verbatim');
    if (!unit.bookAuthor) throw new Error('Vedabase book author is required for quote attribution');

    return {
      originalText: candidate.originalText,
      normalizedHash: quoteFingerprint(candidate.originalText),
      originalLanguage: unit.bookLanguage,
      author: unit.bookAuthor,
      work: unit.bookTitle,
      locator: this.formatLocator(unit.locator),
      sourceType: 'vedamatch_library',
      sourceUrl: null,
      vedabaseBookSlug: unit.bookSlug,
      vedabaseChapterSlug: unit.chapterSlug,
      contextExcerpt: this.createContextExcerpt(unit, candidate.originalText),
      verified: true,
      verifiedAt: new Date(),
    };
  }

  private createContextExcerpt(unit: VedabaseQuoteSearchUnit, quote: string): string {
    if (unit.text.length <= 1_000) return unit.text;

    const rawIndex = unit.text.toLocaleLowerCase().indexOf(quote.toLocaleLowerCase());
    const normalizedIndex = normalizeQuote(unit.text).indexOf(normalizeQuote(quote));
    const estimatedIndex = Math.floor((normalizedIndex / normalizeQuote(unit.text).length) * unit.text.length);
    const matchIndex = rawIndex >= 0 ? rawIndex : Math.max(0, estimatedIndex);
    const start = Math.max(0, Math.min(matchIndex - 450, unit.text.length - 1_000));
    return unit.text.slice(start, start + 1_000);
  }

  private formatLocator(value: unknown): string {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return '';
    const locator = value as Partial<VedabaseLocator>;
    return locator.block ?? locator.unitId ?? '';
  }
}
