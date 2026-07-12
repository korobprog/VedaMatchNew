import { MotivationService } from './motivation.service';

describe('MotivationService admin list', () => {
  it('returns generation diagnostics for administrators', async () => {
    const post = { id: 'post-1', slug: 'daily-post', contentDate: new Date('2026-07-12T00:00:00.000Z'), profileType: 'devotee', audienceTrack: 'universal', category: 'daily', imageUrl: null, storyImageUrl: null, attributionKind: 'ai_reflection', attributionSpeaker: null, attributionWork: null, attributionLocator: null, attributionSourceUrl: null, sourceVerified: false, publishedAt: null, status: 'failed', generationStage: 'failed', generationErrorCode: 'provider_error', attemptCount: 3, translations: [], favorites: [], views: [] };
    const prisma = { motivationPost: { findMany: jest.fn().mockResolvedValue([post]) } };
    const service = new MotivationService(prisma as never, {} as never);
    await expect(service.adminList('admin')).resolves.toEqual([expect.objectContaining({ id: 'post-1', status: 'failed', generationStage: 'failed', generationErrorCode: 'provider_error', attemptCount: 3 })]);
  });
});
