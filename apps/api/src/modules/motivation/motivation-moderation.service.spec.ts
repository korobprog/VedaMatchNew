import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { MotivationModerationService } from './motivation-moderation.service';

const actorId = 'actor-1';
const postId = 'post-1';

const userFor = (
  role: AccessTokenPayload['role'],
  adminServices?: string[],
): AccessTokenPayload => ({
  sub: 'caller-1',
  email: 'caller@example.com',
  role,
  adminServices,
});
const admin = userFor('admin');
const serviceAdmin = userFor('service-admin', ['motivation']);
const otherServiceAdmin = userFor('service-admin', ['music']);
const regularUser = userFor('user');

function post(
  reviewStatus = 'text_review',
  overrides: Record<string, unknown> = {},
) {
  return {
    id: postId,
    reviewStatus,
    imagePromptEditedAt: null,
    videoPrompt: null,
    category: 'verified_quote',
    status: 'draft',
    imageUrl:
      reviewStatus === 'image_review' ? 'https://cdn.test/image.png' : null,
    storyImageUrl:
      reviewStatus === 'image_review' ? 'https://cdn.test/story.png' : null,
    imagePrompt: reviewStatus === 'image_review' ? 'old prompt' : null,
    visualStyle: reviewStatus === 'image_review' ? 'minimal_symbolism' : null,
    textApprovedAt:
      reviewStatus === 'image_review' ? new Date('2026-07-13T00:00:00Z') : null,
    quote: {
      originalText: 'Exact quote about service.',
      author: 'Author',
      contextExcerpt: 'The exact quote concerns compassionate service.',
      profiles: [{ profileType: 'devotee' }],
    },
    translations: [
      {
        text: 'Exact quote about service.\n\nIt encourages compassionate action.',
      },
    ],
    ...overrides,
  };
}

function setup(
  current: ReturnType<typeof post> | null = post(),
  updateCount = 1,
) {
  const transaction = {
    motivationPost: {
      updateMany: jest.fn().mockResolvedValue({ count: updateCount }),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    motivationModerationAudit: {
      create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    },
  };
  const prisma = {
    motivationPost: { findUnique: jest.fn().mockResolvedValue(current) },
    $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) =>
      callback(transaction),
    ),
  };
  return {
    service: new MotivationModerationService(prisma as never),
    prisma,
    transaction,
  };
}

describe('MotivationModerationService', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([admin, serviceAdmin])(
    'allows $role to approve text without invoking image generation',
    async (user) => {
      const { service, transaction } = setup();
      const fetchMock = jest.spyOn(global, 'fetch');

      await service.approveText(user, actorId, postId, 'warm_documentary');

      expect(transaction.motivationPost.updateMany).toHaveBeenCalledWith({
        where: { id: postId, reviewStatus: 'text_review' },
        data: expect.objectContaining({
          reviewStatus: 'image_queued',
          visualStyle: 'warm_documentary',
          imagePrompt: expect.stringContaining('vertical 9:16'),
          textApprovedAt: expect.any(Date),
        }),
      });
      expect(transaction.motivationModerationAudit.create).toHaveBeenCalledWith(
        {
          data: expect.objectContaining({
            postId,
            actorId,
            action: 'approve_text',
            metadata: expect.objectContaining({
              oldStatus: 'text_review',
              newStatus: 'image_queued',
              style: 'warm_documentary',
              reason: null,
            }),
          }),
        },
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('carries the quote source and its context into the image prompt', async () => {
    const { service, transaction } = setup();

    await service.approveText(admin, actorId, postId);

    expect(transaction.motivationPost.updateMany).toHaveBeenCalledWith({
      where: { id: postId, reviewStatus: 'text_review' },
      data: expect.objectContaining({
        imagePrompt: expect.stringContaining(
          'The passage is spoken by Author. Verified context around the passage: The exact quote concerns compassionate service.',
        ),
      }),
    });
  });

  it('publishes only from image_review and audits image approval', async () => {
    const { service, transaction } = setup(post('image_review'));

    await service.approveImage(admin, actorId, postId);

    expect(transaction.motivationPost.updateMany).toHaveBeenCalledWith({
      where: { id: postId, reviewStatus: 'image_review' },
      data: expect.objectContaining({
        reviewStatus: 'published',
        status: 'published',
        imageApprovedAt: expect.any(Date),
        publishedAt: expect.any(Date),
      }),
    });
    expect(transaction.motivationModerationAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'approve_image' }),
    });
  });

  it('rejects unauthorized roles and invalid transitions', async () => {
    const unauthorized = setup().service;
    await expect(
      unauthorized.approveText(regularUser, actorId, postId),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const textReview = setup(post('text_review'));
    await expect(
      textReview.service.approveImage(admin, actorId, postId),
    ).rejects.toThrow('Image is not ready for review');
    expect(
      textReview.transaction.motivationPost.updateMany,
    ).not.toHaveBeenCalled();

    const imageReview = setup(post('image_review'));
    await expect(
      imageReview.service.approveText(admin, actorId, postId),
    ).rejects.toThrow('Text is not ready for review');
  });

  it('rejects a service-admin scoped to a different service', async () => {
    const { service } = setup();
    await expect(
      service.approveText(otherServiceAdmin, actorId, postId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.reject(otherServiceAdmin, actorId, postId, 'reason'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.savePrompts(otherServiceAdmin, actorId, postId, {
        videoPrompt: 'x',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns conflict when a concurrent transition wins', async () => {
    const { service, transaction } = setup(post(), 0);
    await expect(
      service.approveText(admin, actorId, postId),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.motivationModerationAudit.create).not.toHaveBeenCalled();
  });

  it('rejects an unapproved style at the service boundary', async () => {
    const { service, transaction } = setup();
    await expect(
      service.approveText(
        admin,
        actorId,
        postId,
        'neon_advertising' as never,
      ),
    ).rejects.toThrow('Visual style is not approved');
    expect(transaction.motivationPost.updateMany).not.toHaveBeenCalled();
  });

  it('rejects with a required reason and writes it to the audit', async () => {
    const { service, transaction } = setup();
    await expect(
      service.reject(admin, actorId, postId, '  '),
    ).rejects.toThrow('Rejection reason is required');

    await service.reject(
      admin,
      actorId,
      postId,
      'Source needs another review',
    );
    expect(transaction.motivationPost.updateMany).toHaveBeenCalledWith({
      where: { id: postId, reviewStatus: 'text_review' },
      data: expect.objectContaining({ reviewStatus: 'rejected' }),
    });
    expect(transaction.motivationModerationAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reason: 'Source needs another review',
        metadata: expect.objectContaining({
          oldStatus: 'text_review',
          newStatus: 'rejected',
          reason: 'Source needs another review',
        }),
      }),
    });
  });

  it('regenerates only an image-review post by clearing image fields and queueing it', async () => {
    const { service, transaction } = setup(post('image_review'));
    await service.regenerateImage(
      serviceAdmin,
      actorId,
      postId,
      'cinematic_nature',
    );

    expect(transaction.motivationPost.updateMany).toHaveBeenCalledWith({
      where: { id: postId, reviewStatus: 'image_review' },
      data: expect.objectContaining({
        reviewStatus: 'image_queued',
        visualStyle: 'cinematic_nature',
        imageUrl: null,
        storyImageUrl: null,
        imageApprovedAt: null,
        publishedAt: null,
      }),
    });
    expect(transaction.motivationModerationAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'regenerate_image' }),
    });
  });

  it('оставляет отредактированный промпт при перегенерации с тем же стилем', async () => {
    // Ради этой правки промпт и открывали: пересборка черновика стёрла бы её
    // молча, и редактирование стало бы бессмысленным.
    const { service, transaction } = setup(
      post('image_review', {
        imagePrompt: 'Рассвет над Ямуной, руки в намаскаре',
        imagePromptEditedAt: new Date('2026-08-18T10:00:00Z'),
      }),
    );

    await service.regenerateImage(
      admin,
      actorId,
      postId,
      'minimal_symbolism',
    );

    expect(transaction.motivationPost.updateMany).toHaveBeenCalledWith({
      where: { id: postId, reviewStatus: 'image_review' },
      data: expect.objectContaining({
        imagePrompt: 'Рассвет над Ямуной, руки в намаскаре',
      }),
    });
  });

  it('смена стиля пересобирает черновик и снимает отметку о правке', async () => {
    // Стиль вшит в текст промпта: сохранив правку, кнопка вернула бы ту же
    // картинку в прежнем стиле, то есть проигнорировала бы выбор в селекте.
    const { service, transaction } = setup(
      post('image_review', {
        imagePrompt: 'Рассвет над Ямуной',
        imagePromptEditedAt: new Date('2026-08-18T10:00:00Z'),
      }),
    );

    await service.regenerateImage(admin, actorId, postId, 'indian_miniature');

    expect(transaction.motivationPost.updateMany).toHaveBeenCalledWith({
      where: { id: postId, reviewStatus: 'image_review' },
      data: expect.objectContaining({
        visualStyle: 'indian_miniature',
        imagePrompt: expect.stringContaining('vertical 9:16'),
        imagePromptEditedAt: null,
      }),
    });
  });

  it('reports missing posts', async () => {
    const { service } = setup(null);
    await expect(
      service.approveText(admin, actorId, postId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('MotivationModerationService: правка промптов', () => {
  it('сохраняет промпт иллюстрации и помечает его как правленный руками', async () => {
    const { service, transaction } = setup(post('image_review'));

    const result = await service.savePrompts(admin, actorId, postId, {
      imagePrompt: '  Рассвет над Ямуной, тёплый свет  ',
    });

    expect(transaction.motivationPost.update).toHaveBeenCalledWith({
      where: { id: postId },
      data: {
        imagePrompt: 'Рассвет над Ямуной, тёплый свет',
        imagePromptEditedAt: expect.any(Date),
      },
    });
    expect(result.imagePromptEdited).toBe(true);
    expect(transaction.motivationModerationAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        postId,
        actorId,
        action: 'edit_prompts',
      }),
    });
  });

  it('сохраняет промпт видео отдельно от промпта картинки', async () => {
    // Ровно тот случай, ради которого поле и заведено: описание движения
    // не должно подменяться описанием сцены.
    const { service, transaction } = setup(post('image_review'));

    await service.savePrompts(admin, actorId, postId, {
      videoPrompt: 'Gentle breeze in the leaves. Camera almost still.',
    });

    expect(transaction.motivationPost.update).toHaveBeenCalledWith({
      where: { id: postId },
      data: {
        videoPrompt: 'Gentle breeze in the leaves. Camera almost still.',
      },
    });
  });

  it('пустой промпт видео возвращает пост к общему дефолту', async () => {
    const { service, transaction } = setup(post('image_review'));

    const result = await service.savePrompts(admin, actorId, postId, {
      videoPrompt: '   ',
    });

    expect(transaction.motivationPost.update).toHaveBeenCalledWith({
      where: { id: postId },
      data: { videoPrompt: null },
    });
    expect(result.videoPrompt).toBeNull();
  });

  it('пустой промпт иллюстрации не принимает', async () => {
    // Пост с пустым промптом воркер просто не возьмёт и оставит висеть.
    const { service, transaction } = setup(post('image_review'));

    await expect(
      service.savePrompts(admin, actorId, postId, { imagePrompt: '  ' }),
    ).rejects.toThrow('Image prompt cannot be empty');
    expect(transaction.motivationPost.update).not.toHaveBeenCalled();
  });

  it('отбивает промпт, который модель всё равно обрежет', async () => {
    const { service, transaction } = setup(post('image_review'));

    await expect(
      service.savePrompts(admin, actorId, postId, {
        imagePrompt: 'т'.repeat(4001),
      }),
    ).rejects.toThrow('Image prompt is too long');
    expect(transaction.motivationPost.update).not.toHaveBeenCalled();
  });

  it('пустое тело считает ошибкой, а не «сохранить ничего»', async () => {
    const { service, transaction } = setup(post('image_review'));

    await expect(
      service.savePrompts(admin, actorId, postId, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.motivationPost.update).not.toHaveBeenCalled();
  });

  it('не пускает обычного пользователя', async () => {
    const { service } = setup(post('image_review'));

    await expect(
      service.savePrompts(regularUser, actorId, postId, { videoPrompt: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('сообщает о пропавшем посте', async () => {
    const { service } = setup(null);

    await expect(
      service.savePrompts(admin, actorId, postId, { videoPrompt: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
