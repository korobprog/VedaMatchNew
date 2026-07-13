import { MotivationService } from './motivation.service';
import type { MotivationAdminCandidateDto } from '@vedamatch/shared';

describe('MotivationService admin list', () => {
  it('returns generation diagnostics for administrators', async () => {
    const post = { id: 'post-1', slug: 'daily-post', contentDate: new Date('2026-07-12T00:00:00.000Z'), profileType: 'devotee', audienceTrack: 'universal', category: 'daily', imageUrl: null, storyImageUrl: null, attributionKind: 'ai_reflection', attributionSpeaker: null, attributionWork: null, attributionLocator: null, attributionSourceUrl: null, sourceVerified: false, publishedAt: null, status: 'failed', generationStage: 'failed', generationErrorCode: 'provider_error', attemptCount: 3, translations: [], favorites: [], views: [] };
    const prisma = { motivationPost: { findMany: jest.fn().mockResolvedValue([post]) } };
    const service = new MotivationService(prisma as never, {} as never);
    await expect(service.adminList('admin')).resolves.toEqual([expect.objectContaining({ id: 'post-1', status: 'failed', generationStage: 'failed', generationErrorCode: 'provider_error', attemptCount: 3 })]);
  });

  it('returns verified quote moderation data for administrators', async () => {
    const post = {
      id: 'post-2',
      slug: 'verified-quote',
      contentDate: new Date('2026-07-13T00:00:00.000Z'),
      profileType: 'devotee',
      audienceTrack: 'vaishnava',
      category: 'daily',
      imageUrl: null,
      storyImageUrl: null,
      attributionKind: 'exact_quote',
      attributionSpeaker: 'Author',
      attributionWork: 'Work',
      attributionLocator: '1.1',
      attributionSourceUrl: null,
      sourceVerified: true,
      publishedAt: null,
      status: 'draft',
      reviewStatus: 'text_review',
      visualStyle: null,
      imagePrompt: null,
      textApprovedAt: null,
      imageApprovedAt: null,
      generationStage: null,
      generationErrorCode: null,
      attemptCount: 0,
      translations: [],
      favorites: [],
      views: [],
      quote: {
        id: 'quote-1',
        originalText: 'Exact quote',
        originalLanguage: 'en',
        author: 'Author',
        work: 'Work',
        locator: '1.1',
        sourceType: 'vedamatch_library',
        sourceUrl: null,
        contextExcerpt: 'Exact quote in context.',
        verified: true,
        translations: [],
        profiles: [{ profileType: 'devotee' }],
      },
    };
    const prisma = { motivationPost: { findMany: jest.fn().mockResolvedValue([post]) } };
    const service = new MotivationService(prisma as never, {} as never);

    const [candidate]: MotivationAdminCandidateDto[] = await service.adminList('admin') as never;

    expect(candidate).toMatchObject({
      reviewStatus: 'text_review',
      quote: { originalText: 'Exact quote', sourceType: 'vedamatch_library', verified: true },
      profileTypes: ['devotee'],
      visualStyle: null,
    });
  });
});
