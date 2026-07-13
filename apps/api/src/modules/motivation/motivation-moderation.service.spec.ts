import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MotivationModerationService } from './motivation-moderation.service';

const actorId = 'actor-1';
const postId = 'post-1';

function post(reviewStatus = 'text_review') {
  return {
    id: postId,
    reviewStatus,
    category: 'verified_quote',
    status: 'draft',
    imageUrl: reviewStatus === 'image_review' ? 'https://cdn.test/image.png' : null,
    storyImageUrl: reviewStatus === 'image_review' ? 'https://cdn.test/story.png' : null,
    imagePrompt: reviewStatus === 'image_review' ? 'old prompt' : null,
    visualStyle: reviewStatus === 'image_review' ? 'minimal_symbolism' : null,
    textApprovedAt: reviewStatus === 'image_review' ? new Date('2026-07-13T00:00:00Z') : null,
    quote: {
      originalText: 'Exact quote about service.',
      author: 'Author',
      contextExcerpt: 'The exact quote concerns compassionate service.',
      profiles: [{ profileType: 'devotee' }],
    },
    translations: [{ text: 'Exact quote about service.\n\nIt encourages compassionate action.' }],
  };
}

function setup(current = post(), updateCount = 1) {
  const transaction = {
    motivationPost: { updateMany: jest.fn().mockResolvedValue({ count: updateCount }), findUnique: jest.fn(), update: jest.fn() },
    motivationModerationAudit: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
  };
  const prisma = {
    motivationPost: { findUnique: jest.fn().mockResolvedValue(current) },
    $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) => callback(transaction)),
  };
  return {
    service: new MotivationModerationService(prisma as never),
    prisma,
    transaction,
  };
}

describe('MotivationModerationService', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each(['admin', 'service-admin'] as const)('allows %s to approve text without invoking image generation', async (role) => {
    const { service, transaction } = setup();
    const fetchMock = jest.spyOn(global, 'fetch');

    await service.approveText(role, actorId, postId, 'warm_documentary');

    expect(transaction.motivationPost.updateMany).toHaveBeenCalledWith({
      where: { id: postId, reviewStatus: 'text_review' },
      data: expect.objectContaining({
        reviewStatus: 'image_queued',
        visualStyle: 'warm_documentary',
        imagePrompt: expect.stringContaining('vertical 9:16'),
        textApprovedAt: expect.any(Date),
      }),
    });
    expect(transaction.motivationModerationAudit.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      postId, actorId, action: 'approve_text', metadata: expect.objectContaining({ oldStatus: 'text_review', newStatus: 'image_queued', style: 'warm_documentary', reason: null }),
    }) });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('publishes only from image_review and audits image approval', async () => {
    const { service, transaction } = setup(post('image_review'));

    await service.approveImage('admin', actorId, postId);

    expect(transaction.motivationPost.updateMany).toHaveBeenCalledWith({
      where: { id: postId, reviewStatus: 'image_review' },
      data: expect.objectContaining({ reviewStatus: 'published', status: 'published', imageApprovedAt: expect.any(Date), publishedAt: expect.any(Date) }),
    });
    expect(transaction.motivationModerationAudit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'approve_image' }) });
  });

  it('rejects unauthorized roles and invalid transitions', async () => {
    const unauthorized = setup().service;
    await expect(unauthorized.approveText('user', actorId, postId)).rejects.toBeInstanceOf(ForbiddenException);

    const textReview = setup(post('text_review'));
    await expect(textReview.service.approveImage('admin', actorId, postId)).rejects.toThrow('Image is not ready for review');
    expect(textReview.transaction.motivationPost.updateMany).not.toHaveBeenCalled();

    const imageReview = setup(post('image_review'));
    await expect(imageReview.service.approveText('admin', actorId, postId)).rejects.toThrow('Text is not ready for review');
  });

  it('returns conflict when a concurrent transition wins', async () => {
    const { service, transaction } = setup(post(), 0);
    await expect(service.approveText('admin', actorId, postId)).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.motivationModerationAudit.create).not.toHaveBeenCalled();
  });

  it('rejects an unapproved style at the service boundary', async () => {
    const { service, transaction } = setup();
    await expect(service.approveText('admin', actorId, postId, 'neon_advertising' as never)).rejects.toThrow('Visual style is not approved');
    expect(transaction.motivationPost.updateMany).not.toHaveBeenCalled();
  });

  it('rejects with a required reason and writes it to the audit', async () => {
    const { service, transaction } = setup();
    await expect(service.reject('admin', actorId, postId, '  ')).rejects.toThrow('Rejection reason is required');

    await service.reject('admin', actorId, postId, 'Source needs another review');
    expect(transaction.motivationPost.updateMany).toHaveBeenCalledWith({
      where: { id: postId, reviewStatus: 'text_review' },
      data: expect.objectContaining({ reviewStatus: 'rejected' }),
    });
    expect(transaction.motivationModerationAudit.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      reason: 'Source needs another review',
      metadata: expect.objectContaining({ oldStatus: 'text_review', newStatus: 'rejected', reason: 'Source needs another review' }),
    }) });
  });

  it('regenerates only an image-review post by clearing image fields and queueing it', async () => {
    const { service, transaction } = setup(post('image_review'));
    await service.regenerateImage('service-admin', actorId, postId, 'cinematic_nature');

    expect(transaction.motivationPost.updateMany).toHaveBeenCalledWith({
      where: { id: postId, reviewStatus: 'image_review' },
      data: expect.objectContaining({
        reviewStatus: 'image_queued', visualStyle: 'cinematic_nature', imageUrl: null, storyImageUrl: null,
        imageApprovedAt: null, publishedAt: null,
      }),
    });
    expect(transaction.motivationModerationAudit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'regenerate_image' }) });
  });

  it('reports missing posts', async () => {
    const { service } = setup(null);
    await expect(service.approveText('admin', actorId, postId)).rejects.toBeInstanceOf(NotFoundException);
  });
});
