import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { MotivationReelsService } from './motivation-reels.service';

const regularUser: AccessTokenPayload = {
  sub: 'user-1',
  email: 'user@example.com',
  role: 'user',
};
const admin: AccessTokenPayload = {
  sub: 'admin-1',
  email: 'admin@example.com',
  role: 'admin',
};
const motivationServiceAdmin: AccessTokenPayload = {
  sub: 'sa-1',
  email: 'sa@example.com',
  role: 'service-admin',
  adminServices: ['motivation'],
};
const otherServiceAdmin: AccessTokenPayload = {
  sub: 'sa-2',
  email: 'sa2@example.com',
  role: 'service-admin',
  adminServices: ['music'],
};

function build(
  options: {
    mode?: 'off' | 'assist' | 'autonomous';
    usedToday?: number;
    limit?: number;
    enabled?: boolean;
    verdict?: unknown;
    policy?: {
      dailyLimit: number | null;
      trusted: boolean;
      blocked: boolean;
    } | null;
    videoEnabled?: boolean;
    videoConfigured?: boolean;
    voices?: string[];
    voiceDefault?: string | null;
  } = {},
) {
  const tx = {
    motivationQuote: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'quote-1' }),
    },
    motivationPost: {
      create: jest.fn().mockResolvedValue({ id: 'post-1' }),
    },
  };
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ spiritualStage: 'devotee' }),
    },
    motivationPost: {
      count: jest.fn().mockResolvedValue(options.usedToday ?? 0),
      findUnique: jest.fn().mockResolvedValue({ authorUserId: 'user-1' }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    motivationModerationAudit: { create: jest.fn().mockResolvedValue({}) },
    motivationAuthorPolicy: {
      findUnique: jest.fn().mockResolvedValue(options.policy ?? null),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const settings = {
    read: jest.fn().mockResolvedValue({
      userReelsEnabled: options.enabled ?? true,
      userVideoEnabled: options.videoEnabled ?? true,
      userVoices: options.voices ?? ['Aria', 'Roger'],
      userVoiceDefault: options.voiceDefault ?? 'Aria',
      userDailyLimit: options.limit ?? 1,
      aiModerationMode: options.mode ?? 'autonomous',
      aiApproveThreshold: 0.75,
      aiRejectThreshold: 0.85,
      aiEditorialRules: '',
    }),
  };
  const moderation = {
    aiApproveText: jest.fn().mockResolvedValue({}),
    aiReject: jest.fn().mockResolvedValue({}),
    aiNote: jest.fn().mockResolvedValue({}),
  };
  const generation = {
    uploadStory: jest.fn().mockResolvedValue('https://cdn/reel.webp'),
    findUploaded: jest.fn().mockResolvedValue(null),
    moderationVerdict:
      options.verdict instanceof Error
        ? jest.fn().mockRejectedValue(options.verdict)
        : jest
            .fn()
            .mockResolvedValue(
              options.verdict ?? { decision: 'approve', confidence: 0.9 },
            ),
  };
  const verification = {
    findCandidates: jest.fn().mockResolvedValue([]),
    verifyVedabaseCandidate: jest.fn().mockResolvedValue({
      originalText: 'x',
      author: 'Кришна',
      work: 'Бхагавад-гита',
      locator: '2.47',
      originalLanguage: 'ru',
      vedabaseBookSlug: 'bg',
      vedabaseChapterSlug: '2',
      contextExcerpt: 'ctx',
    }),
  };
  const categories = { resolveSlug: jest.fn().mockResolvedValue('daily') };
  const events = { emit: jest.fn() };
  const audio = { modelId: jest.fn().mockResolvedValue('eleven-v3') };
  // Ключ fal.ai по умолчанию есть: без него сервис отказывает раньше всех
  // прочих проверок, и остальные тесты «оживления» не дошли бы до сути.
  const video = { enabled: options.videoConfigured ?? true };
  const service = new MotivationReelsService(
    prisma as never,
    settings as never,
    moderation as never,
    generation as never,
    verification as never,
    categories as never,
    events as never,
    audio as never,
    video as never,
  );
  return {
    service,
    prisma,
    tx,
    moderation,
    generation,
    verification,
    events,
    audio,
    video,
  };
}

const ownInput = {
  source: {
    kind: 'own' as const,
    text: 'Делай что должно, и будь что будет.',
    author: ' Я ',
  },
  language: 'ru' as const,
  audienceTrack: 'universal' as const,
};

describe('MotivationReelsService.create', () => {
  it('creates quote and post for own text and lets the AI approve it', async () => {
    const { service, tx, moderation, events } = build();

    const result = await service.create('user-1', regularUser, ownInput);

    expect(result).toEqual({ id: 'post-1', stage: 'generating', reason: null });
    expect(tx.motivationQuote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceType: 'manual',
          verified: false,
          author: 'Я',
        }),
      }),
    );
    expect(tx.motivationPost.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          origin: 'user',
          authorUserId: 'user-1',
          reviewStatus: 'text_review',
          generationStage: 'ai_review',
          attributionKind: 'ai_reflection',
          sourceVerified: false,
          profileType: 'devotee',
        }),
      }),
    );
    expect(moderation.aiApproveText).toHaveBeenCalledWith(
      'post-1',
      undefined,
      expect.objectContaining({ resolved: 'approve' }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      'motivation.reel.reviewed',
      expect.objectContaining({ decision: 'approve' }),
    );
  });

  it('rejects with the model reason when the verdict is a confident reject', async () => {
    const { service, moderation, events } = build({
      verdict: { decision: 'reject', confidence: 0.95, reason: 'Это реклама.' },
    });

    const result = await service.create('user-1', regularUser, ownInput);

    expect(result).toEqual({
      id: 'post-1',
      stage: 'rejected',
      reason: 'Это реклама.',
    });
    expect(moderation.aiReject).toHaveBeenCalledWith(
      'post-1',
      'Это реклама.',
      expect.anything(),
    );
    // Автору уходит уведомление с той же причиной, что он видит в мастере.
    await Promise.resolve();
    expect(events.emit).toHaveBeenCalledWith(
      'motivation.reel.rejected',
      expect.objectContaining({
        recipientId: 'user-1',
        reason: 'Это реклама.',
      }),
    );
  });

  it('escalates low-confidence verdicts and model failures', async () => {
    const low = build({ verdict: { decision: 'reject', confidence: 0.6 } });
    await expect(
      low.service.create('user-1', regularUser, ownInput),
    ).resolves.toMatchObject({
      stage: 'admin_review',
    });
    expect(low.moderation.aiNote).toHaveBeenCalledWith(
      'post-1',
      'ai_escalate',
      null,
      expect.anything(),
    );

    const broken = build({ verdict: new Error('provider down') });
    await expect(
      broken.service.create('user-1', regularUser, ownInput),
    ).resolves.toMatchObject({
      stage: 'admin_review',
    });
    // Причина сбоя доходит до администратора: по «сбою модели» без
    // подробностей не решить, повторять проверку или разбирать текст.
    expect(broken.moderation.aiNote).toHaveBeenCalledWith(
      'post-1',
      'ai_error',
      expect.stringContaining('Модель'),
      expect.objectContaining({ failure: 'unknown', retryable: false }),
    );
    expect(broken.moderation.aiApproveText).not.toHaveBeenCalled();
  });

  it('only suggests in assist mode and skips the model when off', async () => {
    const assist = build({ mode: 'assist' });
    await assist.service.create('user-1', regularUser, ownInput);
    expect(assist.moderation.aiNote).toHaveBeenCalledWith(
      'post-1',
      'ai_suggest',
      null,
      expect.anything(),
    );
    expect(assist.moderation.aiApproveText).not.toHaveBeenCalled();

    const off = build({ mode: 'off' });
    await off.service.create('user-1', regularUser, ownInput);
    expect(off.generation.moderationVerdict).not.toHaveBeenCalled();
    expect(off.moderation.aiNote).toHaveBeenCalledWith(
      'post-1',
      'ai_escalate',
      null,
      { mode: 'off' },
    );
  });

  it('не повторяет название произведения в заголовке, если оно уже есть в главе', async () => {
    const { service, tx, verification } = build();
    const text =
      'Не умывшись и не приняв душа, он сидел, углубившись в работу.';
    verification.verifyVedabaseCandidate.mockResolvedValue({
      originalText: text,
      author: 'А. Ч. Бхактиведанта Свами Прабхупада',
      work: 'Шримад-Бхагаватам',
      locator: 'Шримад-Бхагаватам 1.6.21',
      originalLanguage: 'ru',
      vedabaseBookSlug: 'sb',
      vedabaseChapterSlug: '1',
      contextExcerpt: 'ctx',
    });

    await service.create('user-1', regularUser, {
      source: { kind: 'vedabase', text, bookSlug: 'sb', chapterSlug: '1' },
      language: 'ru',
      audienceTrack: 'universal',
    });

    expect(tx.motivationPost.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          translations: expect.objectContaining({
            create: expect.arrayContaining([
              expect.objectContaining({
                title: 'Шримад-Бхагаватам 1.6.21',
              }),
            ]),
          }),
        }),
      }),
    );
  });

  it('enforces the daily limit for users but not for admins', async () => {
    const { service } = build({ usedToday: 1, limit: 1 });

    await expect(
      service.create('user-1', regularUser, ownInput),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.create('admin-1', admin, ownInput),
    ).resolves.toMatchObject({ id: 'post-1' });
  });

  it('honours a personal limit and a block on the author', async () => {
    // Личный лимит старше общего: у автора он 3, в настройках 1.
    const generous = build({
      usedToday: 2,
      limit: 1,
      policy: { dailyLimit: 3, trusted: false, blocked: false },
    });
    await expect(
      generous.service.create('user-1', regularUser, ownInput),
    ).resolves.toMatchObject({ id: 'post-1' });

    const blocked = build({
      policy: { dailyLimit: null, trusted: false, blocked: true },
    });
    await expect(
      blocked.service.create('user-1', regularUser, ownInput),
    ).rejects.toThrow('закрыто');
  });

  it('skips the AI check for a trusted author', async () => {
    const { service, generation, moderation } = build({
      policy: { dailyLimit: null, trusted: true, blocked: false },
    });

    await expect(
      service.create('user-1', regularUser, ownInput),
    ).resolves.toMatchObject({
      stage: 'generating',
    });
    expect(generation.moderationVerdict).not.toHaveBeenCalled();
    expect(moderation.aiApproveText).toHaveBeenCalledWith('post-1', undefined, {
      actor: 'trusted-author',
    });
  });

  it('refuses when user reels are switched off', async () => {
    const { service } = build({ enabled: false });

    await expect(
      service.create('user-1', regularUser, ownInput),
    ).rejects.toThrow('Создание своих рилсов сейчас выключено');
  });

  it('verifies a book fragment and copies the attribution', async () => {
    const { service, tx, verification } = build();

    await service.create('user-1', regularUser, {
      ...ownInput,
      source: {
        kind: 'vedabase',
        text: 'Ты имеешь право лишь на действие.',
        bookSlug: 'bg',
        chapterSlug: '2',
      },
    });

    expect(verification.verifyVedabaseCandidate).toHaveBeenCalledWith({
      originalText: 'Ты имеешь право лишь на действие.',
      bookSlug: 'bg',
      chapterSlug: '2',
    });
    expect(tx.motivationPost.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attributionKind: 'exact_quote',
          attributionSpeaker: 'Кришна',
          attributionWork: 'Бхагавад-гита',
          attributionLocator: '2.47',
          sourceVerified: true,
        }),
      }),
    );
  });

  it('turns a failed verification into a readable error', async () => {
    const { service, verification } = build();
    verification.verifyVedabaseCandidate.mockRejectedValue(
      new Error('Quote not found verbatim'),
    );

    await expect(
      service.create('user-1', regularUser, {
        ...ownInput,
        source: {
          kind: 'vedabase',
          text: 'Чего-то нет в главе, точно нет.',
          bookSlug: 'bg',
          chapterSlug: '2',
        },
      }),
    ).rejects.toThrow('не найден в этой главе');
  });

  it.each([
    [{ ...ownInput, source: { kind: 'own', text: 'коротко' } }, 'короткий'],
    [
      { ...ownInput, source: { kind: 'own', text: 'x'.repeat(601) } },
      'длинный',
    ],
    [{ ...ownInput, audienceTrack: 'other' }, 'трек'],
    [{ ...ownInput, visualStyle: 'neon' }, 'стиль'],
    [{ ...ownInput, language: 'fr' }, 'язык'],
  ])('rejects invalid input %#', async (input, fragment) => {
    const { service } = build();
    await expect(
      service.create('user-1', regularUser, input as never),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.create('user-1', regularUser, input as never),
    ).rejects.toThrow(fragment);
  });
});

describe('MotivationReelsService.uploadImage', () => {
  const png = Buffer.from(
    // 1×1 PNG: sharp прочитает его как настоящую картинку.
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  it('refuses a file of the wrong type before touching storage', async () => {
    const { service, generation } = build();

    await expect(
      service.uploadImage('user-1', 'post-1', {
        buffer: png,
        mimetype: 'image/gif',
        size: png.length,
      }),
    ).rejects.toThrow('JPEG');
    expect(generation.uploadStory).not.toHaveBeenCalled();
  });

  it('refuses a picture that is too small to carry a quote', async () => {
    const { service, prisma } = build();
    prisma.motivationPost.findFirst.mockResolvedValue({
      id: 'post-1',
      status: 'draft',
      reviewStatus: 'text_review',
    });

    await expect(
      service.uploadImage('user-1', 'post-1', {
        buffer: png,
        mimetype: 'image/png',
        size: png.length,
      }),
    ).rejects.toThrow('маленькая');
  });

  it('refuses to replace the picture of a published reel', async () => {
    const { service, prisma } = build();
    prisma.motivationPost.findFirst.mockResolvedValue({
      id: 'post-1',
      status: 'published',
      reviewStatus: 'published',
    });

    await expect(
      service.uploadImage('user-1', 'post-1', {
        buffer: png,
        mimetype: 'image/png',
        size: png.length,
      }),
    ).rejects.toThrow('уже опубликован');
  });
});

describe('MotivationReelsService.animate', () => {
  const published = {
    id: 'post-1',
    imageUrl: 'https://cdn/a.png',
    videoStatus: 'none',
    status: 'published',
  };

  /** Полный вид поста: после заказа сервис перечитывает рилс через get(). */
  const full = {
    ...published,
    slug: 'reel-1',
    contentDate: new Date('2026-08-20T00:00:00Z'),
    profileType: 'devotee',
    audienceTrack: 'universal',
    category: 'daily',
    reviewStatus: 'published',
    generationStage: 'published',
    storyImageUrl: null,
    videoUrl: null,
    attributionKind: 'exact_quote',
    attributionSpeaker: null,
    attributionWork: null,
    attributionLocator: null,
    attributionSourceUrl: null,
    sourceVerified: true,
    publishedAt: new Date('2026-08-20T01:00:00Z'),
    likeCount: 0,
    createdAt: new Date('2026-08-20T00:30:00Z'),
    translations: [
      { language: 'ru', title: 'Т', text: 'Текст', storyText: 'Т' },
    ],
    favorites: [],
    views: [],
    likes: [],
    moderationAudits: [],
  };

  it('queues the video for a published reel of its author', async () => {
    const { service, prisma } = build();
    prisma.motivationPost.findFirst
      .mockResolvedValueOnce(published)
      .mockResolvedValueOnce({ ...full, videoStatus: 'queued' });

    const reel = await service.animate('user-1', regularUser, 'post-1');

    expect(reel).toMatchObject({ videoState: 'queued', canAnimate: false });

    expect(prisma.motivationPost.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          videoStatus: 'queued',
          videoErrorCode: null,
        }),
      }),
    );
    expect(prisma.motivationModerationAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'author_animate',
          actorId: 'user-1',
        }),
      }),
    );
  });

  it('refuses when fal.ai is not configured, instead of queueing into a void', async () => {
    // Прод-случай: FAL_KEY не задан, воркер видео не стартовал. Раньше заказ
    // молча уходил в queued и залипал там навсегда.
    const { service, prisma } = build({ videoConfigured: false });
    prisma.motivationPost.findFirst.mockResolvedValue(published);

    await expect(
      service.animate('user-1', regularUser, 'post-1'),
    ).rejects.toThrow('не настроен');
    expect(prisma.motivationPost.update).not.toHaveBeenCalled();
  });

  it('refuses an admin too: the key lives in the environment, not in settings', async () => {
    const { service, prisma } = build({ videoConfigured: false });
    prisma.motivationPost.findFirst.mockResolvedValue(published);

    await expect(service.animate('admin-1', admin, 'post-1')).rejects.toThrow(
      'не настроен',
    );
  });

  it('refuses when video for participants is switched off', async () => {
    const { service, prisma } = build({ videoEnabled: false });
    prisma.motivationPost.findFirst.mockResolvedValue(published);

    await expect(
      service.animate('user-1', regularUser, 'post-1'),
    ).rejects.toThrow('выключено');
  });

  it.each([
    [{ ...published, status: 'draft' }, 'опубликованный'],
    [{ ...published, imageUrl: null }, 'картинка'],
    [{ ...published, videoStatus: 'running' }, 'уже готовится'],
    [{ ...published, videoStatus: 'ready' }, 'уже готов'],
  ])('refuses %#', async (post, fragment) => {
    const { service, prisma } = build();
    prisma.motivationPost.findFirst.mockResolvedValue(post);

    await expect(
      service.animate('user-1', regularUser, 'post-1'),
    ).rejects.toThrow(fragment);
  });
});

describe('MotivationReelsService.voiceOptions', () => {
  it('offers the voices chosen by the admin with human labels and samples', async () => {
    const { service, generation } = build();
    generation.findUploaded = jest
      .fn()
      .mockImplementation((key: string) =>
        key.includes('Aria')
          ? Promise.resolve('https://cdn/aria.mp3')
          : Promise.resolve(null),
      );

    await expect(service.voiceOptions()).resolves.toEqual([
      {
        value: 'Aria',
        label: 'Женский, тёплый',
        sampleUrl: 'https://cdn/aria.mp3',
        isDefault: true,
      },
      // Образца ещё нет — это не мешает выбрать голос, только послушать.
      {
        value: 'Roger',
        label: 'Мужской, глубокий',
        sampleUrl: null,
        isDefault: false,
      },
    ]);
  });

  it('never synthesises a sample on listing: that call is paid', async () => {
    const { service, generation } = build();
    generation.findUploaded = jest.fn().mockResolvedValue(null);

    await service.voiceOptions();

    expect(generation.uploadStory).not.toHaveBeenCalled();
  });
});

describe('MotivationReelsService.searchSources', () => {
  it('ignores queries that are too short to search by', async () => {
    const { service, verification } = build();

    await expect(service.searchSources(' и ')).resolves.toEqual([]);
    expect(verification.findCandidates).not.toHaveBeenCalled();
  });

  it('returns fragments ready for the wizard', async () => {
    const { service, verification } = build();
    verification.findCandidates.mockResolvedValue([
      {
        bookSlug: 'bhagavad-gita',
        bookTitle: 'Бхагавад-гита как она есть',
        bookAuthor: 'Прабхупада',
        chapterSlug: '2',
        locator: { chapter: 2, verse: 47 },
        text: 'Ты имеешь право лишь на действие, но не на его плоды.',
      },
    ]);

    await expect(service.searchSources('действие')).resolves.toEqual([
      {
        text: 'Ты имеешь право лишь на действие, но не на его плоды.',
        bookSlug: 'bhagavad-gita',
        bookTitle: 'Бхагавад-гита как она есть',
        chapterSlug: '2',
        locator: '2.47',
      },
    ]);
    expect(verification.findCandidates).toHaveBeenCalledWith('действие', 40);
  });
});

describe('MotivationReelsService.quota', () => {
  it('reports unlimited for admins and remaining for users', async () => {
    const { service } = build({ usedToday: 1, limit: 3 });

    await expect(service.quota('u', regularUser)).resolves.toMatchObject({
      used: 1,
      limit: 3,
      remaining: 2,
      unlimited: false,
    });
    await expect(service.quota('a', admin)).resolves.toMatchObject({
      unlimited: true,
      used: 0,
    });
  });

  it('пускает service-admin, которому выдан сервис motivation', async () => {
    const { service } = build({ usedToday: 1, limit: 3 });

    await expect(
      service.quota('sa', motivationServiceAdmin),
    ).resolves.toMatchObject({
      unlimited: true,
      used: 0,
    });
  });

  it('не даёт безлимит service-admin другого сервиса', async () => {
    const { service } = build({ usedToday: 1, limit: 3 });

    await expect(
      service.quota('sa2', otherServiceAdmin),
    ).resolves.toMatchObject({
      unlimited: false,
      used: 1,
    });
  });
});

describe('MotivationReelsService.appeal', () => {
  const rejected = {
    id: 'post-1',
    slug: 'reel-x',
    contentDate: new Date('2026-08-19T00:00:00Z'),
    profileType: 'devotee',
    audienceTrack: 'universal',
    category: 'daily',
    status: 'draft',
    reviewStatus: 'rejected',
    generationStage: 'rejected',
    imageUrl: null,
    storyImageUrl: null,
    videoUrl: null,
    videoStatus: 'none',
    attributionKind: 'ai_reflection',
    attributionSpeaker: null,
    attributionWork: null,
    attributionLocator: null,
    attributionSourceUrl: null,
    sourceVerified: false,
    publishedAt: null,
    likeCount: 0,
    createdAt: new Date('2026-08-19T10:00:00Z'),
    translations: [
      { language: 'ru', title: 'Свой рилс', text: 'Текст', storyText: 'Текст' },
    ],
    favorites: [],
    views: [],
    likes: [],
    moderationAudits: [
      { action: 'ai_reject', reason: 'Реклама.', createdAt: new Date() },
    ],
  };

  it('records one appeal per rejected reel', async () => {
    const { service, prisma, events } = build();
    prisma.motivationPost.findFirst
      .mockResolvedValueOnce(rejected)
      .mockResolvedValueOnce({
        ...rejected,
        moderationAudits: [
          ...rejected.moderationAudits,
          { action: 'appeal', reason: 'Не согласен', createdAt: new Date() },
        ],
      });

    const reel = await service.appeal('user-1', 'post-1', {
      message: 'Не согласен',
    });

    expect(prisma.motivationModerationAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'appeal', actorId: 'user-1' }),
      }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      'motivation.reel.appealed',
      expect.objectContaining({ postId: 'post-1' }),
    );
    expect(reel).toMatchObject({
      stage: 'rejected',
      reason: 'Реклама.',
      canAppeal: false,
    });
  });

  it('refuses a second appeal', async () => {
    const { service, prisma } = build();
    prisma.motivationPost.findFirst.mockResolvedValue({
      ...rejected,
      moderationAudits: [
        ...rejected.moderationAudits,
        { action: 'appeal', reason: 'x', createdAt: new Date() },
      ],
    });

    await expect(
      service.appeal('user-1', 'post-1', { message: 'Ещё раз' }),
    ).rejects.toThrow('один раз');
  });
});
