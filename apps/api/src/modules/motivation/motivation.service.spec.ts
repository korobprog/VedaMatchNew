import { MotivationService } from './motivation.service';
import type { MotivationAdminCandidateDto } from '@vedamatch/shared';

describe('MotivationService admin list', () => {
  it('includes verified quotes assigned to the user profile', async () => {
    const motivationPost = { findMany: jest.fn().mockResolvedValue([]) };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ spiritualStage: 'devotee' }),
      },
      motivationPreference: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ vaishnavaPercent: 50, language: 'ru' }),
      },
      motivationPost,
    };
    const service = new MotivationService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.feed('user-1', {});

    expect(motivationPost.findMany).toHaveBeenCalledTimes(2);
    for (const [input] of motivationPost.findMany.mock.calls) {
      expect(input.where).toMatchObject({
        status: 'published',
        OR: [
          { profileType: 'devotee' },
          { quote: { profiles: { some: { profileType: 'devotee' } } } },
        ],
      });
    }
  });

  it('returns generation diagnostics for administrators', async () => {
    const post = {
      id: 'post-1',
      slug: 'daily-post',
      contentDate: new Date('2026-07-12T00:00:00.000Z'),
      profileType: 'devotee',
      audienceTrack: 'universal',
      category: 'daily',
      imageUrl: null,
      storyImageUrl: null,
      attributionKind: 'ai_reflection',
      attributionSpeaker: null,
      attributionWork: null,
      attributionLocator: null,
      attributionSourceUrl: null,
      sourceVerified: false,
      publishedAt: null,
      status: 'failed',
      generationStage: 'failed',
      generationErrorCode: 'provider_error',
      attemptCount: 3,
      translations: [],
      favorites: [],
      views: [],
    };
    const prisma = {
      motivationPost: { findMany: jest.fn().mockResolvedValue([post]) },
    };
    const service = new MotivationService(
      prisma as never,
      {} as never,
      {} as never,
    );
    await expect(service.adminList('admin')).resolves.toEqual([
      expect.objectContaining({
        id: 'post-1',
        status: 'failed',
        generationStage: 'failed',
        generationErrorCode: 'provider_error',
        attemptCount: 3,
      }),
    ]);
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
    const prisma = {
      motivationPost: { findMany: jest.fn().mockResolvedValue([post]) },
    };
    const service = new MotivationService(
      prisma as never,
      {} as never,
      {} as never,
    );

    const [candidate]: MotivationAdminCandidateDto[] = (await service.adminList(
      'admin',
    )) as never;

    expect(candidate).toMatchObject({
      reviewStatus: 'text_review',
      quote: {
        originalText: 'Exact quote',
        sourceType: 'vedamatch_library',
        verified: true,
      },
      profileTypes: ['devotee'],
      visualStyle: null,
    });
  });

  it('uses verified quote discovery for manual daily generation', async () => {
    const date = new Date('2026-07-13T00:00:00.000Z');
    const discovery = {
      discoverDaily: jest.fn().mockResolvedValue([{ id: 'quote-1' }]),
    };
    const service = new MotivationService(
      {} as never,
      {} as never,
      discovery as never,
    );

    await expect(service.generateDaily(date)).resolves.toEqual([
      { id: 'quote-1' },
    ]);
    expect(discovery.discoverDaily).toHaveBeenCalledWith(date, 8);
  });
});

describe('MotivationService.addManualQuote', () => {
  const validInput = {
    originalText: 'Exact quote text here.',
    originalLanguage: 'en',
    author: 'Author Name',
    work: 'Work Title',
    locator: '1.1',
    contextExcerpt: 'Context around the quote.',
  };

  function buildService(overrides: { prisma?: unknown; copy?: unknown } = {}) {
    const prisma =
      overrides.prisma ??
      {
        motivationQuote: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'quote-1' }),
        },
      };
    const copy =
      overrides.copy ?? { prepareCandidate: jest.fn().mockResolvedValue({ id: 'post-1' }) };
    const service = new MotivationService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      copy as never,
    );
    return { service, prisma: prisma as never, copy: copy as never };
  }

  it('creates a verified manual quote and hands it to the copy pipeline', async () => {
    const { service, prisma, copy } = buildService();

    await expect(service.addManualQuote('admin', validInput)).resolves.toEqual({
      quoteId: 'quote-1',
      postId: 'post-1',
    });

    expect(
      (prisma as { motivationQuote: { create: jest.Mock } }).motivationQuote.create,
    ).toHaveBeenCalledWith({
      data: expect.objectContaining({
        originalText: validInput.originalText,
        originalLanguage: validInput.originalLanguage,
        author: validInput.author,
        work: validInput.work,
        locator: validInput.locator,
        contextExcerpt: validInput.contextExcerpt,
        sourceType: 'manual',
        sourceUrl: null,
        verified: true,
        discoveryDate: null,
      }),
    });
    expect(
      (copy as { prepareCandidate: jest.Mock }).prepareCandidate,
    ).toHaveBeenCalledWith('quote-1');
  });

  it('trims input and stores an optional source URL', async () => {
    const { service, prisma } = buildService();

    await service.addManualQuote('admin', {
      ...validInput,
      originalText: `  ${validInput.originalText}  `,
      sourceUrl: '  https://example.com/source  ',
    });

    expect(
      (prisma as { motivationQuote: { create: jest.Mock } }).motivationQuote.create,
    ).toHaveBeenCalledWith({
      data: expect.objectContaining({
        originalText: validInput.originalText,
        sourceUrl: 'https://example.com/source',
      }),
    });
  });

  it('rejects a duplicate quote without touching the copy pipeline', async () => {
    const prisma = {
      motivationQuote: {
        findUnique: jest.fn().mockResolvedValue({ id: 'existing' }),
        create: jest.fn(),
      },
    };
    const copy = { prepareCandidate: jest.fn() };
    const { service } = buildService({ prisma, copy });

    await expect(service.addManualQuote('admin', validInput)).rejects.toThrow(
      'This quote has already been added',
    );
    expect(prisma.motivationQuote.create).not.toHaveBeenCalled();
    expect(copy.prepareCandidate).not.toHaveBeenCalled();
  });

  it('rejects missing required fields', async () => {
    const { service } = buildService();

    await expect(
      service.addManualQuote('admin', { ...validInput, author: '   ' }),
    ).rejects.toThrow('All quote fields except source URL are required');
  });

  it('requires an admin or service-admin role', async () => {
    const { service } = buildService();

    await expect(service.addManualQuote('user', validInput)).rejects.toThrow();
  });
});
