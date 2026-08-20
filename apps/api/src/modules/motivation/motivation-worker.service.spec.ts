import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
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
  attributionSpeaker: null,
  attributionWork: null,
  attributionLocator: null,
  storyCaption: true,
  // Воркер тянет их ради подписи на сторис.
  translations: [{ storyText: 'Не сдавайся на полпути.' }],
  quote: {
    originalText: 'Не сдавайся на полпути.',
    author: 'Шрила Прабхупада',
    work: 'Лиламрита',
    locator: 'Глава 6',
  },
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
    // URL из ключа: иначе обычная картинка и сторис неотличимы в проверках.
    uploadStory: jest
      .fn()
      .mockImplementation(async (key: string) => `https://cdn.test/${key}`),
    generateCopy: jest.fn(),
    generateImage: jest.fn(),
  };
  const config = {
    get: jest.fn().mockReturnValue(undefined),
  } as unknown as ConfigService;
  const copy = { prepareCandidate: jest.fn() };
  return {
    worker: new MotivationWorkerService(
      prisma as never,
      generation as never,
      config,
      copy as never,
    ),
    prisma,
    motivationPost,
    generation,
  };
}

describe('MotivationWorkerService', () => {
  it('перегрузка провайдера не тратит попытку и откладывает кадр', async () => {
    // Провайдер картинок отвечает 429 «модель перегружена». Раньше три таких
    // отказа подряд за полторы минуты хоронили кадр, который просто некому
    // было нарисовать.
    const { worker, motivationPost, generation } = createWorker();
    generation.generateApprovedImage.mockRejectedValue(
      new Error('Image provider error 429: модель сейчас перегружена'),
    );
    // Второй раз пост читают уже в разборе сбоя: там он занят генерацией.
    motivationPost.findUnique
      .mockResolvedValueOnce(approvedPost)
      .mockResolvedValueOnce({
        attemptCount: 1,
        reviewStatus: 'image_queued',
        status: 'generating',
      });

    await worker.tick();

    const failure = motivationPost.updateMany.mock.calls
      .map(([input]) => input as { data: Record<string, unknown> })
      .find((input) => input.data.generationErrorCode === 'provider_busy');
    expect(failure).toBeDefined();
    expect(failure?.data).toMatchObject({
      reviewStatus: 'image_queued',
      status: 'draft',
      attemptCount: { decrement: 1 },
    });
  });

  it('обычный сбой по-прежнему тратит попытку', async () => {
    const { worker, motivationPost, generation } = createWorker();
    generation.generateApprovedImage.mockRejectedValue(
      new Error('Image provider returned no valid PNG'),
    );
    motivationPost.findUnique
      .mockResolvedValueOnce(approvedPost)
      .mockResolvedValueOnce({
        attemptCount: 1,
        reviewStatus: 'image_queued',
        status: 'generating',
      });

    await worker.tick();

    const failure = motivationPost.updateMany.mock.calls
      .map(([input]) => input as { data: Record<string, unknown> })
      .find((input) => 'generationErrorCode' in input.data && input.data.generationErrorCode !== null);
    expect(failure?.data.attemptCount).toBeUndefined();
  });

  it('не берёт из очереди кадр, отложенный из-за перегрузки', async () => {
    const { worker, motivationPost } = createWorker();

    await worker.tick();

    const [claim] = motivationPost.findFirst.mock.calls[0] as [
      { where: { OR?: unknown[] } },
    ];
    expect(claim.where.OR).toEqual([
      { generationErrorCode: { not: 'provider_busy' } },
      { updatedAt: { lt: expect.any(Date) } },
    ]);
  });

  it('prepares all discovered quotes before marking the UTC day complete', async () => {
    const quotes = Array.from({ length: 8 }, (_, index) => ({
      id: `quote-${index + 1}`,
    }));
    const discovery = { discoverDaily: jest.fn().mockResolvedValue(quotes) };
    const copy = {
      prepareCandidate: jest
        .fn()
        .mockResolvedValue({ reviewStatus: 'text_review' }),
    };
    const { prisma, generation } = createWorker();
    const config = {
      get: jest.fn((key: string) =>
        key === 'MOTIVATION_DAILY_CANDIDATE_COUNT' ? '8' : undefined,
      ),
    } as unknown as ConfigService;
    const worker = new MotivationWorkerService(
      prisma as never,
      generation as never,
      config,
      copy as never,
      discovery as never,
    );

    await (
      worker as unknown as { ensureDailyDiscovery(): Promise<void> }
    ).ensureDailyDiscovery();

    expect(
      copy.prepareCandidate.mock.calls.map(([quoteId]) => quoteId),
    ).toEqual(quotes.map((quote) => quote.id));
    expect(
      copy.prepareCandidate.mock.results.every(
        (result) => result.type === 'return',
      ),
    ).toBe(true);
    expect(
      (worker as unknown as { lastDiscoveryDate?: string }).lastDiscoveryDate,
    ).toBe(new Date().toISOString().slice(0, 10));
  });

  it('does not mark discovery done when copy preparation is only partially complete', async () => {
    const quotes = Array.from({ length: 8 }, (_, index) => ({
      id: `quote-${index + 1}`,
    }));
    const discovery = { discoverDaily: jest.fn().mockResolvedValue(quotes) };
    const prepared = new Set<string>();
    const aiCalls: string[] = [];
    let failedOnce = false;
    const copy = {
      prepareCandidate: jest.fn(async (quoteId: string) => {
        if (prepared.has(quoteId))
          return { id: `post-${quoteId}`, reviewStatus: 'text_review' };
        aiCalls.push(quoteId);
        if (quoteId === 'quote-2' && !failedOnce) {
          failedOnce = true;
          throw new Error('provider unavailable');
        }
        prepared.add(quoteId);
        return { id: `post-${quoteId}`, reviewStatus: 'text_review' };
      }),
    };
    const { prisma, generation } = createWorker();
    const config = {
      get: jest.fn((key: string) =>
        key === 'MOTIVATION_DAILY_CANDIDATE_COUNT' ? '8' : undefined,
      ),
    } as unknown as ConfigService;
    const worker = new MotivationWorkerService(
      prisma as never,
      generation as never,
      config,
      copy as never,
      discovery as never,
    );

    await expect(
      (
        worker as unknown as { ensureDailyDiscovery(): Promise<void> }
      ).ensureDailyDiscovery(),
    ).rejects.toThrow('provider unavailable');

    expect(
      (worker as unknown as { lastDiscoveryDate?: string }).lastDiscoveryDate,
    ).toBeUndefined();
    expect(copy.prepareCandidate).toHaveBeenCalledTimes(2);

    await (
      worker as unknown as { ensureDailyDiscovery(): Promise<void> }
    ).ensureDailyDiscovery();

    expect(discovery.discoverDaily).toHaveBeenCalledTimes(2);
    expect(aiCalls.filter((quoteId) => quoteId === 'quote-1')).toHaveLength(1);
    expect(aiCalls).toHaveLength(9);
    expect(
      (worker as unknown as { lastDiscoveryDate?: string }).lastDiscoveryDate,
    ).toBe(new Date().toISOString().slice(0, 10));
  });

  it('continues approved image generation when daily copy preparation fails', async () => {
    const discovery = {
      discoverDaily: jest.fn().mockResolvedValue([{ id: 'quote-1' }]),
    };
    const copy = {
      prepareCandidate: jest
        .fn()
        .mockRejectedValue(new Error('invalid provider response')),
    };
    const { prisma, generation, motivationPost } = createWorker();
    const worker = new MotivationWorkerService(
      prisma as never,
      generation as never,
      new ConfigService(),
      copy as never,
      discovery as never,
    );

    await expect(worker.tick()).resolves.toBeUndefined();

    expect(discovery.discoverDaily).toHaveBeenCalledTimes(1);
    expect(copy.prepareCandidate).toHaveBeenCalledTimes(1);
    expect(motivationPost.findFirst).toHaveBeenCalled();
    expect(generation.generateApprovedImage).toHaveBeenCalledWith({
      imagePrompt: approvedPost.imagePrompt,
      textApprovedAt: approvedPost.textApprovedAt,
    });
    expect(motivationPost.updateMany).toHaveBeenCalledWith({
      where: {
        id: approvedPost.id,
        reviewStatus: 'image_queued',
        status: 'generating',
        generationStage: 'image',
      },
      data: expect.objectContaining({
        reviewStatus: 'image_review',
        status: 'draft',
        generationStage: 'image_review',
        imageUrl: expect.stringContaining('https://cdn.test/motivation/'),
      }),
    });
    expect((worker as unknown as { running: boolean }).running).toBe(false);
  });

  it('uploads the story frame as a separate file next to the plain image', async () => {
    const { worker, motivationPost, generation } = createWorker();
    // Настоящий PNG, иначе композит не соберётся и сработает откат.
    generation.generateApprovedImage.mockResolvedValue(
      await sharp({
        create: {
          width: 1024,
          height: 1536,
          channels: 3,
          background: { r: 20, g: 20, b: 40 },
        },
      })
        .png()
        .toBuffer(),
    );

    await worker.tick();

    const keys = generation.uploadStory.mock.calls.map(([key]) => key);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(/\/v\d+\.png$/);
    expect(keys[1]).toMatch(/\/v\d+-story\.png$/);

    const update = motivationPost.updateMany.mock.calls.find(
      ([input]) => input.data.reviewStatus === 'image_review',
    )?.[0];
    expect(update.data.storyImageUrl).toMatch(/-story\.png$/);
    expect(update.data.storyImageUrl).not.toBe(update.data.imageUrl);

    // Кадр сторис вертикальнее исходных 2:3.
    const [, storyBytes] = generation.uploadStory.mock.calls[1];
    const meta = await sharp(storyBytes as Buffer).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1920);
  });

  it('falls back to the plain image when the story frame cannot be composed', async () => {
    const { worker, motivationPost } = createWorker();

    await worker.tick();

    const update = motivationPost.updateMany.mock.calls.find(
      ([input]) => input.data.reviewStatus === 'image_review',
    )?.[0];
    expect(update.data.storyImageUrl).toBe(update.data.imageUrl);
  });

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
        // Отложенные из-за перегрузки провайдера ждут своей паузы.
        OR: [
          { generationErrorCode: { not: 'provider_busy' } },
          { updatedAt: { lt: expect.any(Date) } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(generation.generateApprovedImage).toHaveBeenCalledWith({
      imagePrompt: approvedPost.imagePrompt,
      textApprovedAt: approvedPost.textApprovedAt,
    });
    expect(generation.generateCopy).not.toHaveBeenCalled();
    expect(generation.generateImage).not.toHaveBeenCalled();
    const imageReviewUpdate = motivationPost.updateMany.mock.calls.find(
      ([input]) => input.data.reviewStatus === 'image_review',
    )?.[0];
    expect(imageReviewUpdate).toEqual({
      where: {
        id: approvedPost.id,
        reviewStatus: 'image_queued',
        status: 'generating',
        generationStage: 'image',
      },
      data: expect.objectContaining({
        reviewStatus: 'image_review',
        status: 'draft',
        generationStage: 'image_review',
        imageUrl: expect.stringMatching(/\/v\d+\.png$/),
        // Композит падает: `Buffer.from('png')` — не картинка. Проверяем, что
        // пост из-за этого не срывается и кнопка получает рабочую ссылку.
        storyImageUrl: expect.stringMatching(/\/v\d+\.png$/),
      }),
    });
    expect(imageReviewUpdate.data).not.toHaveProperty('publishedAt');
    expect(
      motivationPost.updateMany.mock.calls.some(
        ([input]) => input.data.status === 'published',
      ),
    ).toBe(false);
  });

  it('does not select legacy queued posts without text approval and an image prompt', async () => {
    const { worker, motivationPost, generation } = createWorker();
    motivationPost.findFirst.mockResolvedValue(null);

    await worker.tick();

    expect(motivationPost.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          reviewStatus: 'image_queued',
          textApprovedAt: { not: null },
          imagePrompt: { not: null },
        }),
      }),
    );
    expect(generation.generateApprovedImage).not.toHaveBeenCalled();
  });

  it('requeues only approved image failures from today on startup', async () => {
    const { worker, motivationPost } = createWorker();

    await (
      worker as unknown as { retryTodaysFailedJobs(): Promise<void> }
    ).retryTodaysFailedJobs();

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

    await (
      worker as unknown as { recoverExpiredJobs(): Promise<void> }
    ).recoverExpiredJobs();

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
    expect(expiredAt.getTime()).toBeGreaterThanOrEqual(
      before - 5 * 60_000 - 100,
    );
    expect(expiredAt.getTime()).toBeLessThanOrEqual(
      Date.now() - 5 * 60_000 + 100,
    );
    expect(recoverCall.data).toMatchObject({
      status: 'draft',
      generationStage: 'image_queued',
      generationErrorCode: 'lease_expired',
    });
  });

  it('keeps approved image jobs queued after a retryable provider failure', async () => {
    const { worker, motivationPost, generation } = createWorker();
    generation.generateApprovedImage.mockRejectedValue(
      new Error('provider failed'),
    );
    motivationPost.findUnique
      .mockResolvedValueOnce({ ...approvedPost, attemptCount: 1 })
      .mockResolvedValueOnce({
        attemptCount: 1,
        reviewStatus: 'image_queued',
        status: 'generating',
      });

    await worker.tick();

    expect(motivationPost.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: approvedPost.id,
        reviewStatus: 'image_queued',
        status: 'generating',
        generationStage: 'image',
      },
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
    generation.generateApprovedImage.mockRejectedValue(
      new Error('provider failed'),
    );
    motivationPost.findUnique
      .mockResolvedValueOnce({ ...approvedPost, attemptCount: 3 })
      .mockResolvedValueOnce({
        attemptCount: 3,
        reviewStatus: 'image_queued',
        status: 'generating',
      });

    await worker.tick();

    expect(motivationPost.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: approvedPost.id,
        reviewStatus: 'image_queued',
        status: 'generating',
        generationStage: 'image',
      },
      data: {
        reviewStatus: 'failed',
        status: 'failed',
        generationStage: 'image',
        generationErrorCode: 'provider failed',
      },
    });
  });
});
