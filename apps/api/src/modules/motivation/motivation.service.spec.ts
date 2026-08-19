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
        findUnique: jest.fn().mockResolvedValue({
          vaishnavaPercent: 50,
          language: 'ru',
          profileTypes: [],
        }),
      },
      motivationPost,
    };
    const service = new MotivationService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.feed('user-1', {});

    expect(motivationPost.findMany).toHaveBeenCalledTimes(2);
    for (const [input] of motivationPost.findMany.mock.calls) {
      // Настройки пустые, поэтому профиль берётся из самоидентификации.
      expect(input.where).toMatchObject({
        status: 'published',
        OR: [
          { profileType: { in: ['devotee'] } },
          {
            quote: { profiles: { some: { profileType: { in: ['devotee'] } } } },
          },
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
      {} as never,
      {} as never,
      {} as never,
      {} as never,
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
      {} as never,
      {} as never,
      {} as never,
      {} as never,
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
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.generateDaily(date)).resolves.toEqual([
      { id: 'quote-1' },
    ]);
    expect(discovery.discoverDaily).toHaveBeenCalledWith(date, 8);
  });
});

describe('MotivationService feed profiles', () => {
  function buildFeed(profileTypes: string[]) {
    const motivationPost = { findMany: jest.fn().mockResolvedValue([]) };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ spiritualStage: 'seeker' }),
      },
      motivationPreference: {
        findUnique: jest.fn().mockResolvedValue({
          vaishnavaPercent: 50,
          language: 'ru',
          profileTypes,
        }),
      },
      motivationPost,
    };
    const service = new MotivationService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, motivationPost };
  }

  it('uses the profiles picked in settings', async () => {
    const { service, motivationPost } = buildFeed(['yogi', 'devotee']);

    await service.feed('user-1', {});

    for (const [input] of motivationPost.findMany.mock.calls)
      expect(input.where.OR[0]).toEqual({
        profileType: { in: ['yogi', 'devotee'] },
      });
  });

  it('falls back to self-identification when nothing is picked', async () => {
    // Пустой список — «выбора не делали», а не «показывать нечего».
    const { service, motivationPost } = buildFeed([]);

    await service.feed('user-1', {});

    for (const [input] of motivationPost.findMany.mock.calls)
      expect(input.where.OR[0]).toEqual({ profileType: { in: ['user'] } });
  });
});

describe('MotivationService.savePreference', () => {
  function buildService() {
    const upsert = jest.fn().mockResolvedValue({});
    const service = new MotivationService(
      { motivationPreference: { upsert } } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, upsert };
  }

  it('stores the picked profiles without duplicates', async () => {
    const { service, upsert } = buildService();

    await service.savePreference('user-1', {
      vaishnavaPercent: 40,
      profileTypes: ['yogi', 'devotee', 'yogi'] as never,
    });

    expect(upsert.mock.calls[0][0].update.profileTypes).toEqual([
      'yogi',
      'devotee',
    ]);
  });

  it('accepts an empty list as "follow my self-identification"', async () => {
    const { service, upsert } = buildService();

    await service.savePreference('user-1', {
      vaishnavaPercent: 40,
      profileTypes: [],
    });

    expect(upsert.mock.calls[0][0].update.profileTypes).toEqual([]);
  });

  it('rejects an unknown profile', async () => {
    const { service } = buildService();

    await expect(
      service.savePreference('user-1', {
        vaishnavaPercent: 40,
        profileTypes: ['ghost'] as never,
      }),
    ).rejects.toThrow('Некорректные настройки');
  });

  it('leaves the profiles untouched when the field is absent', async () => {
    const { service, upsert } = buildService();

    await service.savePreference('user-1', { vaishnavaPercent: 40 });

    expect(upsert.mock.calls[0][0].update).not.toHaveProperty('profileTypes');
  });
});

describe('MotivationService.adminDelete', () => {
  function buildService(post: { id: string; quoteId: string | null } | null) {
    const transaction = {
      motivationPost: { delete: jest.fn() },
      motivationQuote: { delete: jest.fn() },
    };
    const prisma = {
      motivationPost: { findUnique: jest.fn().mockResolvedValue(post) },
      $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    };
    const service = new MotivationService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, transaction };
  }

  it('removes the post together with its quote', async () => {
    const { service, transaction } = buildService({
      id: 'post-1',
      quoteId: 'quote-1',
    });

    await service.adminDelete('admin', 'post-1');

    expect(transaction.motivationPost.delete).toHaveBeenCalledWith({
      where: { id: 'post-1' },
    });
    expect(transaction.motivationQuote.delete).toHaveBeenCalledWith({
      where: { id: 'quote-1' },
    });
  });

  it('removes a post that has no quote attached', async () => {
    const { service, transaction } = buildService({
      id: 'post-1',
      quoteId: null,
    });

    await service.adminDelete('admin', 'post-1');

    expect(transaction.motivationPost.delete).toHaveBeenCalled();
    expect(transaction.motivationQuote.delete).not.toHaveBeenCalled();
  });

  it('reports a missing post instead of deleting nothing quietly', async () => {
    const { service } = buildService(null);

    await expect(service.adminDelete('admin', 'ghost')).rejects.toThrow(
      'Motivation post not found',
    );
  });

  it('requires an admin or service-admin role', async () => {
    const { service } = buildService({ id: 'post-1', quoteId: 'quote-1' });

    await expect(service.adminDelete('user', 'post-1')).rejects.toThrow();
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
    const prisma = overrides.prisma ?? {
      motivationQuote: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'quote-1' }),
      },
    };
    const copy = overrides.copy ?? {
      prepareCandidate: jest.fn().mockResolvedValue({ id: 'post-1' }),
    };
    const categories = {
      resolveSlug: jest.fn().mockResolvedValue('verified_quote'),
    };
    const service = new MotivationService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      copy as never,
      categories as never,
      {} as never,
    );
    return {
      service,
      prisma: prisma as never,
      copy: copy as never,
      categories,
    };
  }

  it('creates a verified manual quote and hands it to the copy pipeline', async () => {
    const { service, prisma, copy } = buildService();

    await expect(service.addManualQuote('admin', validInput)).resolves.toEqual({
      quoteId: 'quote-1',
      postId: 'post-1',
    });

    expect(
      (prisma as { motivationQuote: { create: jest.Mock } }).motivationQuote
        .create,
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
    ).toHaveBeenCalledWith('quote-1', 'verified_quote');
  });

  it('stores empty strings for the optional attribution fields', async () => {
    const { service, prisma, copy } = buildService();

    await service.addManualQuote('admin', {
      originalText: 'Only the essentials.',
      originalLanguage: 'ru',
      author: 'Author Name',
    });

    expect(
      (prisma as { motivationQuote: { create: jest.Mock } }).motivationQuote
        .create,
    ).toHaveBeenCalledWith({
      data: expect.objectContaining({
        work: '',
        locator: '',
        contextExcerpt: '',
        sourceUrl: null,
      }),
    });
    expect(
      (copy as { prepareCandidate: jest.Mock }).prepareCandidate,
    ).toHaveBeenCalled();
  });

  it('routes the chosen category through the dictionary', async () => {
    const { service, categories, copy } = buildService();
    categories.resolveSlug.mockResolvedValue('smirenie');

    await service.addManualQuote('admin', {
      ...validInput,
      category: 'smirenie',
    });

    expect(categories.resolveSlug).toHaveBeenCalledWith('smirenie');
    expect(
      (copy as { prepareCandidate: jest.Mock }).prepareCandidate,
    ).toHaveBeenCalledWith('quote-1', 'smirenie');
  });

  it('trims input and stores an optional source URL', async () => {
    const { service, prisma } = buildService();

    await service.addManualQuote('admin', {
      ...validInput,
      originalText: `  ${validInput.originalText}  `,
      sourceUrl: '  https://example.com/source  ',
    });

    expect(
      (prisma as { motivationQuote: { create: jest.Mock } }).motivationQuote
        .create,
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
    ).rejects.toThrow('Quote text, language and author are required');
  });

  it('requires an admin or service-admin role', async () => {
    const { service } = buildService();

    await expect(service.addManualQuote('user', validInput)).rejects.toThrow();
  });
});

describe('MotivationService.previewVoice', () => {
  function build(cached: string | null) {
    const audio = {
      speak: jest.fn(async () => ({ audio: Buffer.from('mp3'), seconds: 3 })),
      // Модель входит в ключ кэша: у v2 и v3 одинаковые имена голосов, но
      // звучат они по-разному.
      modelId: () => 'fal-ai/elevenlabs/tts/eleven-v3',
    };
    const generation = {
      findUploaded: jest.fn(async () => cached),
      uploadStory: jest.fn(async () => 'https://cdn/new.mp3'),
    };
    const service = new MotivationService(
      {} as never,
      generation as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      audio as never,
    );
    return { service, audio, generation };
  }

  it('готовый образец берёт из хранилища и не платит повторно', async () => {
    const { service, audio } = build('https://cdn/Rachel.mp3');

    await expect(service.previewVoice('admin', 'Rachel')).resolves.toEqual({
      audio: 'https://cdn/Rachel.mp3',
      cached: true,
    });
    // Каждый синтез стоит денег, а фраза и голос те же — платить дважды не за что.
    expect(audio.speak).not.toHaveBeenCalled();
  });

  it('отсутствующий синтезирует и кладёт в хранилище', async () => {
    const { service, audio, generation } = build(null);

    await expect(service.previewVoice('admin', 'George')).resolves.toEqual({
      audio: 'https://cdn/new.mp3',
      cached: false,
    });
    expect(audio.speak).toHaveBeenCalled();
    expect(generation.uploadStory).toHaveBeenCalledWith(
      'motivation/voice-preview/fal-ai-elevenlabs-tts-eleven-v3/George.mp3',
      expect.any(Buffer),
      'audio/mpeg',
    );
  });

  it('неизвестный голос отбивает до обращения к провайдеру', async () => {
    const { service, audio } = build(null);

    await expect(service.previewVoice('admin', 'Валера')).rejects.toThrow();
    // За неизвестный голос провайдер списал бы деньги так же, как за верный.
    expect(audio.speak).not.toHaveBeenCalled();
  });
});
