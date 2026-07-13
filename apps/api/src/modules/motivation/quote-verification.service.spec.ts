import { QuoteVerificationService } from './quote-verification.service';

describe('QuoteVerificationService', () => {
  const exact = 'You have a right to perform your prescribed duty.';
  const searchUnit = {
    bookSlug: 'bg',
    bookTitle: 'Bhagavad-gita As It Is',
    bookAuthor: 'A. C. Bhaktivedanta Swami Prabhupada',
    bookLanguage: 'en',
    chapterSlug: '2',
    locator: '2.47',
    title: 'Text 47',
    text: `Introduction. ${exact} But you are not entitled to the fruits of action.`,
    rank: 1,
  };

  const repository = {
    findQuoteCandidates: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findQuoteCandidates.mockResolvedValue([searchUnit]);
  });

  it('verifies an exact quote and preserves complete attribution', async () => {
    const service = new QuoteVerificationService(repository as never);

    await expect(service.verifyVedabaseCandidate({
      bookSlug: 'bg',
      chapterSlug: '2',
      originalText: exact,
    })).resolves.toMatchObject({
      originalText: exact,
      originalLanguage: 'en',
      author: searchUnit.bookAuthor,
      work: searchUnit.bookTitle,
      locator: '2.47',
      sourceType: 'vedamatch_library',
      vedabaseBookSlug: 'bg',
      vedabaseChapterSlug: '2',
      verified: true,
      contextExcerpt: expect.stringContaining(exact),
    });
  });

  it('rejects text that is not present verbatim after normalization', async () => {
    const service = new QuoteVerificationService(repository as never);

    await expect(service.verifyVedabaseCandidate({
      bookSlug: 'bg',
      chapterSlug: '2',
      originalText: 'invented',
    })).rejects.toThrow('Quote not found verbatim');
  });

  it('bounds the context excerpt to 1,000 characters', async () => {
    repository.findQuoteCandidates.mockResolvedValue([{
      ...searchUnit,
      text: `${'a'.repeat(700)} ${exact} ${'b'.repeat(700)}`,
    }]);
    const service = new QuoteVerificationService(repository as never);

    const verified = await service.verifyVedabaseCandidate({
      bookSlug: 'bg',
      chapterSlug: '2',
      originalText: exact,
    });

    expect(verified.contextExcerpt.length).toBeLessThanOrEqual(1_000);
    expect(verified.contextExcerpt).toContain(exact);
  });
});
