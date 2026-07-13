import { quoteFingerprint } from './quote-normalizer';
import { QuoteDiscoveryService } from './quote-discovery.service';

describe('QuoteDiscoveryService', () => {
  it('uses internal search before web, drops duplicates and unverified results, and saves eight', async () => {
    const order: string[] = [];
    const internalUnits = Array.from({ length: 5 }, (_, index) => ({
      bookSlug: 'bg', chapterSlug: String(index + 1), text: `Internal exact quote ${index + 1}`,
    }));
    const repository = { findQuoteCandidates: jest.fn(async () => { order.push('internal'); return internalUnits; }) };
    const verifier = { verifyVedabaseCandidate: jest.fn(async (candidate) => ({
      ...candidate, normalizedHash: quoteFingerprint(candidate.originalText), originalLanguage: 'en',
      author: 'Author', work: 'Work', locator: candidate.chapterSlug, sourceType: 'vedamatch_library',
      sourceUrl: null, vedabaseBookSlug: candidate.bookSlug, vedabaseChapterSlug: candidate.chapterSlug,
      contextExcerpt: candidate.originalText, verified: true, verifiedAt: new Date(),
    })) };
    const web = { search: jest.fn(async () => { order.push('external'); return [
      { originalText: 'Internal exact quote 1', author: 'Duplicate', work: 'Wikiquote', locator: '', sourceUrl: 'https://en.wikiquote.org/wiki/Duplicate', contextExcerpt: 'Internal exact quote 1', verified: true },
      { originalText: 'Unverified', author: 'Unknown', work: 'Wikiquote', locator: '', sourceUrl: 'https://en.wikiquote.org/wiki/Unknown', contextExcerpt: 'Different text', verified: false },
      ...Array.from({ length: 3 }, (_, index) => ({ originalText: `Web exact quote ${index + 1}`, author: `Web ${index + 1}`, work: 'Wikiquote', locator: '', sourceUrl: `https://en.wikiquote.org/wiki/Web_${index + 1}`, contextExcerpt: `Web exact quote ${index + 1}`, verified: true })),
    ]; }) };
    const saved: any[] = [];
    const tx = {
      motivationQuote: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn(async ({ data }) => { saved.push(...data); return { count: data.length }; }),
        findManyAfter: jest.fn(),
      },
    };
    const prisma = {
      motivationQuote: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (callback) => callback(tx)),
    };
    tx.motivationQuote.findMany = jest.fn().mockImplementation(async () => saved);
    const service = new QuoteDiscoveryService(prisma as never, repository as never, verifier as never, web as never);

    const result = await service.discoverDaily(new Date('2026-07-13T00:00:00Z'), 8);

    expect(result).toHaveLength(8);
    expect(order).toEqual(['internal', 'external']);
    expect(saved.every((quote) => quote.verified)).toBe(true);
  });

  it('does not count an already persisted hash toward the daily eight', async () => {
    const existingHash = quoteFingerprint('Existing exact quote');
    const units = [
      { bookSlug: 'bg', chapterSlug: '1', text: 'Existing exact quote' },
      ...Array.from({ length: 8 }, (_, index) => ({ bookSlug: 'bg', chapterSlug: String(index + 2), text: `Brand new exact quote ${index + 1}` })),
    ];
    const repository = { findQuoteCandidates: jest.fn().mockResolvedValue(units) };
    const verifier = { verifyVedabaseCandidate: jest.fn(async (candidate) => ({
      ...candidate, normalizedHash: quoteFingerprint(candidate.originalText), originalLanguage: 'en', author: 'Author',
      work: 'Work', locator: candidate.chapterSlug, sourceType: 'vedamatch_library', sourceUrl: null,
      vedabaseBookSlug: candidate.bookSlug, vedabaseChapterSlug: candidate.chapterSlug, contextExcerpt: candidate.originalText,
      verified: true, verifiedAt: new Date(),
    })) };
    const web = { search: jest.fn().mockResolvedValue([]) };
    const saved: any[] = [];
    const transaction = { motivationQuote: {
      createMany: jest.fn(async ({ data }) => { saved.push(...data); return { count: data.length }; }),
      findMany: jest.fn(async () => saved),
    } };
    const prisma = {
      motivationQuote: { findMany: jest.fn().mockResolvedValue([{ normalizedHash: existingHash }]) },
      $transaction: jest.fn(async (callback) => callback(transaction)),
    };
    const service = new QuoteDiscoveryService(prisma as never, repository as never, verifier as never, web as never);

    const result = await service.discoverDaily(new Date('2026-07-13T00:00:00Z'), 8);

    expect(result).toHaveLength(8);
    expect(saved).toHaveLength(8);
    expect(saved.some((quote) => quote.normalizedHash === existingHash)).toBe(false);
  });

  it('fails when eight unique verified quotes cannot be found', async () => {
    const prisma = { motivationQuote: { findMany: jest.fn().mockResolvedValue([]) }, $transaction: jest.fn() };
    const repository = { findQuoteCandidates: jest.fn().mockResolvedValue([]) };
    const verifier = { verifyVedabaseCandidate: jest.fn() };
    const web = { search: jest.fn().mockResolvedValue([]) };
    const service = new QuoteDiscoveryService(prisma as never, repository as never, verifier as never, web as never);

    await expect(service.discoverDaily(new Date(), 8)).rejects.toThrow('insufficient_verified_quotes');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
