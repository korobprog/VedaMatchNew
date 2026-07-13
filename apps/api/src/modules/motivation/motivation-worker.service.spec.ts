import { ConfigService } from '@nestjs/config';
import { MotivationWorkerService } from './motivation-worker.service';

const approvedPost = {
  id: 'post-1',
  slug: 'approved-post',
  contentDate: new Date('2026-07-13T00:00:00.000Z'),
  profileType: 'devotee',
  audienceTrack: 'vaishnava',
  status: 'draft',
  reviewStatus: 'image_queued',
  generationStage: 'image_queued',
  attemptCount: 0,
  textApprovedAt: new Date('2026-07-13T10:00:00.000Z'),
  imagePrompt: 'Approved visual direction without any quoted text.',
};

function createWorker(overrides: Record<string, unknown> = {}) {
  const motivationPost = {
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    findFirst: jest.fn().mockResolvedValue(approvedPost),
    findUnique: jest.fn().mockResolvedValue(approvedPost),
    update: jest.fn().mockResolvedValue(approvedPost),
  };
  const prisma = { motivationPost, ...overrides };
  const generation = {
    generateApprovedImage: jest.fn().mockResolvedValue(Buffer.from('png')),
    uploadStory: jest.fn().mockResolvedValue('https://cdn.test/motivation/post.png'),
    generateCopy: jest.fn(),
    generateImage: jest.fn(),
  };
  const config = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
  return { worker: new MotivationWorkerService(prisma as never, generation as never, config), prisma, motivationPost, generation };
}

describe('MotivationWorkerService', () => {
  it('claims only approved image jobs and stops at image review', async () => {
    const { worker, motivationPost, generation } = createWorker();

    await worker.tick();

    expect(motivationPost.findFirst).toHaveBeenCalledWith({
      where: {
        reviewStatus: 'image_queued',
        status: 'draft',
        generationStage: 'image_queued',
        textApprovedAt: { not: null },
        imagePrompt: { not: null },
        attemptCount: { lt: 3 },
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(generation.generateApprovedImage).toHaveBeenCalledWith({
      imagePrompt: approvedPost.imagePrompt,
      textApprovedAt: approvedPost.textApprovedAt,
    });
    expect(generation.generateCopy).not.toHaveBeenCalled();
    expect(generation.generateImage).not.toHaveBeenCalled();
    const imageReviewUpdate = motivationPost.updateMany.mock.calls.find(([input]) => input.data.reviewStatus === 'image_review')?.[0];
    expect(imageReviewUpdate).toEqual({
      where: { id: approvedPost.id, reviewStatus: 'image_queued', status: 'generating', generationStage: 'image' },
      data: expect.objectContaining({
        reviewStatus: 'image_review',
        status: 'draft',
        generationStage: 'image_review',
        imageUrl: 'https://cdn.test/motivation/post.png',
        storyImageUrl: 'https://cdn.test/motivation/post.png',
      }),
    });
    expect(imageReviewUpdate.data).not.toHaveProperty('publishedAt');
    expect(motivationPost.updateMany.mock.calls.some(([input]) => input.data.status === 'published')).toBe(false);
  });

  it('does not select legacy queued posts without text approval and an image prompt', async () => {
    const { worker, motivationPost, generation } = createWorker();
    motivationPost.findFirst.mockResolvedValue(null);

    await worker.tick();

    expect(motivationPost.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        reviewStatus: 'image_queued',
        textApprovedAt: { not: null },
        imagePrompt: { not: null },
      }),
    }));
    expect(generation.generateApprovedImage).not.toHaveBeenCalled();
  });

  it('requeues only approved image failures from today on startup', async () => {
    const { worker, motivationPost } = createWorker();

    await (worker as unknown as { retryTodaysFailedJobs(): Promise<void> }).retryTodaysFailedJobs();

    expect(motivationPost.updateMany).toHaveBeenCalledWith({
      where: {
        contentDate: expect.any(Date),
        reviewStatus: 'failed',
        generationStage: 'image',
        textApprovedAt: { not: null },
        imagePrompt: { not: null },
      },
      data: {
        reviewStatus: 'image_queued',
        status: 'draft',
        generationStage: 'image_queued',
        generationErrorCode: null,
        attemptCount: 0,
      },
    });
  });

  it('recovers only stale approved image jobs', async () => {
    const { worker, motivationPost } = createWorker();
    const before = Date.now();

    await (worker as unknown as { recoverExpiredJobs(): Promise<void> }).recoverExpiredJobs();

    const recoverCall = motivationPost.updateMany.mock.calls[0][0];
    expect(recoverCall.where).toMatchObject({
      reviewStatus: 'image_queued',
      status: 'generating',
      generationStage: 'image',
      textApprovedAt: { not: null },
      imagePrompt: { not: null },
      attemptCount: { lt: 3 },
    });
    const expiredAt = recoverCall.where.updatedAt.lt as Date;
    expect(expiredAt.getTime()).toBeGreaterThanOrEqual(before - 5 * 60_000 - 100);
    expect(expiredAt.getTime()).toBeLessThanOrEqual(Date.now() - 5 * 60_000 + 100);
    expect(recoverCall.data).toMatchObject({ status: 'draft', generationStage: 'image_queued', generationErrorCode: 'lease_expired' });
  });

  it('keeps approved image jobs queued after a retryable provider failure', async () => {
    const { worker, motivationPost, generation } = createWorker();
    generation.generateApprovedImage.mockRejectedValue(new Error('provider failed'));
    motivationPost.findUnique
      .mockResolvedValueOnce({ ...approvedPost, attemptCount: 1 })
      .mockResolvedValueOnce({ attemptCount: 1, reviewStatus: 'image_queued', status: 'generating' });

    await worker.tick();

    expect(motivationPost.updateMany).toHaveBeenLastCalledWith({
      where: { id: approvedPost.id, reviewStatus: 'image_queued', status: 'generating', generationStage: 'image' },
      data: {
        reviewStatus: 'image_queued',
        status: 'draft',
        generationStage: 'image_queued',
        generationErrorCode: 'provider failed',
      },
    });
  });

  it('marks the image review workflow failed after three attempts', async () => {
    const { worker, motivationPost, generation } = createWorker();
    generation.generateApprovedImage.mockRejectedValue(new Error('provider failed'));
    motivationPost.findUnique
      .mockResolvedValueOnce({ ...approvedPost, attemptCount: 3 })
      .mockResolvedValueOnce({ attemptCount: 3, reviewStatus: 'image_queued', status: 'generating' });

    await worker.tick();

    expect(motivationPost.updateMany).toHaveBeenLastCalledWith({
      where: { id: approvedPost.id, reviewStatus: 'image_queued', status: 'generating', generationStage: 'image' },
      data: {
        reviewStatus: 'failed',
        status: 'failed',
        generationStage: 'image',
        generationErrorCode: 'provider failed',
      },
    });
  });
});
