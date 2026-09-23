import { NotFoundException } from '@nestjs/common';
import { MotivationService } from './motivation.service';
import type {
  AccessTokenPayload,
  MotivationAdminCandidateDto,
} from '@vedamatch/shared';

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
const regularUser: AccessTokenPayload = {
  sub: 'user-1',
  email: 'user@example.com',
  role: 'user',
};

describe('MotivationService admin list', () => {
  it('includes verified quotes assigned to the user profile', async () => {
    const motivationPost = {
      findMany: jest.fn().mockResolvedValue([]),
      // Закреплённый пост лента ищет отдельным запросом; без него мок
      // не описывает используемую часть клиента.
      findFirst: jest.fn().mockResolvedValue(null),
    };
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
        upsert: jest.fn().mockResolvedValue({}),
      },
      motivationPost,
      userBlock: { findMany: jest.fn().mockResolvedValue([]) },
      motivationCategory: { findMany: jest.fn().mockResolvedValue([]) },
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

    expect(motivationPost.findMany).toHaveBeenCalledTimes(1);
    for (const [input] of motivationPost.findMany.mock.calls) {
      // Настройки пустые, поэтому профиль берётся из самоидентификации.
      expect(input.where).toMatchObject({
        status: 'published',
        OR: [
          { profileType: { in: ['devotee'] } },
          {
            quote: { profiles: { some: { profileType: { in: ['devotee'] } } } },
          },
          // Свой рилс автор видит всегда — настройки ленты не должны прятать
          // от него его же публикацию.
          { authorUserId: 'user-1' },
          // Готовую картинку редакция несёт в раздел для всех, а не под
          // профиль (VED-87).
          { captionInImage: true },
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
    await expect(service.adminList(admin)).resolves.toEqual([
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
      admin,
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
    const motivationPost = {
      findMany: jest.fn().mockResolvedValue([]),
      // Закреплённый пост лента ищет отдельным запросом; без него мок
      // не описывает используемую часть клиента.
      findFirst: jest.fn().mockResolvedValue(null),
    };
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
        upsert: jest.fn().mockResolvedValue({}),
      },
      motivationPost,
      userBlock: { findMany: jest.fn().mockResolvedValue([]) },
      motivationCategory: { findMany: jest.fn().mockResolvedValue([]) },
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

  it('в папке подбора под путь нет: раздел отдаётся целиком', async () => {
    const { service, motivationPost } = buildFeed(['devotee']);

    await service.feed('user-1', { category: 'vedy' });

    // Иначе над разделом стоит «9», а внутри лежат две карточки: счётчик
    // считает всё опубликованное, а выдача отдавала выборку под профиль.
    for (const [input] of motivationPost.findMany.mock.calls) {
      expect(input.where.OR).toBeUndefined();
      expect(input.where.category).toBe('vedy');
    }
  });
});

describe('MotivationService feed tiers', () => {
  const day = (n: number) => new Date(Date.UTC(2026, 7, n));
  function post(id: string, publishedAt: Date, viewedAt: Date | null) {
    return {
      id,
      slug: id,
      contentDate: publishedAt,
      profileType: 'user',
      audienceTrack: 'universal',
      category: 'daily',
      imageUrl: null,
      storyImageUrl: null,
      videoUrl: null,
      videoStatus: 'none',
      attributionKind: 'ai_reflection',
      attributionSpeaker: null,
      attributionWork: null as string | null,
      attributionLocator: null as string | null,
      attributionSourceUrl: null,
      sourceVerified: false,
      publishedAt,
      likeCount: 3,
      translations: [],
      favorites: [],
      views: viewedAt ? [{ viewedAt }] : [],
      likes: [],
    };
  }
  function build(lastSeenAt: Date | null, posts: ReturnType<typeof post>[]) {
    const motivationPost = {
      // Лента читает посты одним запросом: доля вайшнавских публикаций из неё
      // убрана, делить выборку на треки больше незачем.
      findMany: jest.fn().mockResolvedValue(posts),
      // Закреплённый пост лента ищет отдельным запросом.
      findFirst: jest.fn().mockResolvedValue(null),
    };
    const motivationPreference = {
      findUnique: jest.fn().mockResolvedValue({
        vaishnavaPercent: 0,
        language: 'ru',
        profileTypes: [],
        lastSeenAt,
      }),
      upsert: jest.fn().mockResolvedValue({}),
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ spiritualStage: 'seeker' }),
      },
      motivationPreference,
      motivationPost,
      userBlock: { findMany: jest.fn().mockResolvedValue([]) },
      motivationCategory: { findMany: jest.fn().mockResolvedValue([]) },
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
    return { service, prisma, motivationPost, motivationPreference };
  }

  it('orders fresh, then unseen, then seen and records the visit', async () => {
    const { service, motivationPreference } = build(day(10), [
      post('seen', day(1), day(2)),
      post('archive', day(5), null),
      post('fresh', day(12), null),
    ]);

    const page = await service.feed('user-1', {});

    expect(page.items.map((item) => `${item.feedTier}:${item.id}`)).toEqual([
      'fresh:fresh',
      'unseen:archive',
      'seen:seen',
    ]);
    expect(page.items[0]).toMatchObject({ likeCount: 3, isLiked: false });
    expect(motivationPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        update: { lastSeenAt: expect.any(Date) },
      }),
    );
  });

  it('keeps the session on later pages instead of re-reading the visit', async () => {
    // Вторая страница приходит с курсором: отметку визита не трогаем и
    // ярусы считаем по зафиксированным в курсоре значениям.
    const { service, motivationPreference, motivationPost } = build(day(19), [
      post('a', day(12), null),
    ]);
    const first = await service.feed('user-1', { limit: 1 });
    motivationPreference.upsert.mockClear();

    const second = await service.feed('user-1', {
      cursor: first.nextCursor ?? undefined,
      limit: 1,
    });

    expect(motivationPreference.upsert).not.toHaveBeenCalled();
    expect(second.items).toEqual([]);
    for (const [input] of motivationPost.findMany.mock.calls)
      expect(input.where.publishedAt).toEqual({ lte: expect.any(Date) });
  });

  // VED-121: две ленты — открытки с напечатанным текстом отдельно от
  // картинок нейросети с цитатой поверх.
  it('splits the feed into ready cards and neural-network art by style', async () => {
    const { service, motivationPost } = build(day(10), []);

    await service.feed('user-1', { style: 'cards' });
    expect(motivationPost.findMany.mock.calls[0][0].where.captionInImage).toBe(
      true,
    );

    motivationPost.findMany.mockClear();
    await service.feed('user-1', { style: 'art' });
    expect(motivationPost.findMany.mock.calls[0][0].where.captionInImage).toBe(
      false,
    );

    // Без стиля — обе вместе: так читают избранное и список.
    motivationPost.findMany.mockClear();
    await service.feed('user-1', {});
    expect(motivationPost.findMany.mock.calls[0][0].where).not.toHaveProperty(
      'captionInImage',
    );
  });

  interface FindArgs {
    select?: Record<string, boolean>;
    distinct?: string[];
    include?: unknown;
    orderBy?: unknown;
    where: Record<string, unknown>;
  }
  const findCall = (mock: jest.Mock, pick: (args: FindArgs) => unknown) =>
    (mock.mock.calls as [FindArgs][]).map(([args]) => args).find(pick)!;

  // VED-206 + VED-125: лента одного источника — вся книга по порядку стихов.
  it('filters by work across spellings and orders it by verse', async () => {
    const verse = (id: string, work: string, locator: string) => ({
      ...post(id, day(5), null),
      attributionWork: work,
      attributionLocator: locator,
    });
    const all = [
      verse('v214', 'Бхагавад-гита', '2.14'),
      verse('v1025', 'бхагавад-гита ', '10.25'),
      verse('v213', 'Бхагавад-гита', '2.13'),
      verse('v125', 'Бхагавад-гита', '1.25'),
    ];
    const { service, motivationPost, motivationPreference } = build(
      day(10),
      [],
    );
    motivationPost.findMany.mockImplementation(
      (args: {
        distinct?: string[];
        select?: Record<string, boolean>;
        where: { id?: { in: string[] } };
      }) => {
        if (args.distinct)
          return Promise.resolve([
            { attributionWork: 'Бхагавад-гита' },
            { attributionWork: 'бхагавад-гита ' },
            { attributionWork: 'Шримад-Бхагаватам' },
          ]);
        if (args.select) return Promise.resolve(all);
        const ids = args.where.id?.in ?? [];
        // База отдаёт страницу в своём порядке — сервис обязан вернуть свой.
        return Promise.resolve(all.filter((item) => ids.includes(item.id)));
      },
    );

    const first = await service.feed('user-1', {
      work: ' БХАГАВАД-ГИТА',
      style: 'art',
      category: 'vedy',
      limit: 3,
    });

    expect(first.items.map((item) => item.id)).toEqual([
      'v125',
      'v213',
      'v214',
    ]);
    const light = findCall(
      motivationPost.findMany,
      (args) => args.select && !args.distinct,
    );
    expect(light.where).toMatchObject({
      attributionWork: { in: ['Бхагавад-гита', 'бхагавад-гита '] },
      category: 'vedy',
      captionInImage: false,
      publishedAt: { lte: expect.any(Date) as unknown },
    });
    // Фильтр — явная просьба, как папка: без подбора под путь и без визита.
    expect(light.where).not.toHaveProperty('OR');
    expect(motivationPreference.upsert).not.toHaveBeenCalled();

    const second = await service.feed('user-1', {
      work: 'Бхагавад-гита',
      cursor: first.nextCursor ?? undefined,
      limit: 3,
    });
    expect(second.items.map((item) => item.id)).toEqual(['v1025']);
    expect(second.nextCursor).toBeNull();
  });

  // VED-389: «Случайный» не перемешивает ленту источника, а номер стиха,
  // записанный только в заголовке, ставит пост на его место в книге.
  it('keeps verse order for a work even with shuffle, across pages', async () => {
    const verse = (
      id: string,
      locator: string | null,
      title = '',
      work = 'Бхагавад-гита',
    ) => ({
      ...post(id, day(5), null),
      attributionWork: work,
      attributionLocator: locator,
      translations: title ? [{ title }] : [],
    });
    const all = [
      verse('none', null, 'Без номера'),
      verse('v262', '2.62'),
      verse('v210', null, 'Бхагавад-гита 2.10'),
      verse('v29', '2.9'),
      verse('v1812', null, '', 'Бхагавад-гита 18.12'),
      verse('v11', '1.1'),
      verse('v262r', '2.62-63'),
    ];
    const { service, motivationPost } = build(day(10), []);
    motivationPost.findMany.mockImplementation(
      (args: {
        distinct?: string[];
        select?: unknown;
        where: { id?: { in: string[] } };
      }) => {
        if (args.distinct)
          return Promise.resolve([
            { attributionWork: 'Бхагавад-гита' },
            { attributionWork: 'Бхагавад-гита 18.12' },
          ]);
        if (args.select) return Promise.resolve(all);
        const ids = args.where.id?.in ?? [];
        return Promise.resolve(all.filter((item) => ids.includes(item.id)));
      },
    );

    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await service.feed('user-1', {
        work: 'Бхагавад-гита',
        shuffle: true,
        limit: 3,
        cursor,
      });
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    expect(seen).toEqual([
      'v11',
      'v29',
      'v210',
      'v262',
      'v262r',
      'v1812',
      'none',
    ]);
    // Заголовок просим на языке читателя — узкой выборкой, не весь пост.
    const light = findCall(
      motivationPost.findMany,
      (args) => Boolean(args.select) && !args.distinct,
    );
    expect(light.select).toMatchObject({
      translations: { where: { language: 'ru' }, select: { title: true } },
    });
  });

  it('shows an empty feed for an unknown work instead of the whole feed', async () => {
    const { service, motivationPost } = build(day(10), []);
    motivationPost.findMany.mockImplementation(
      (args: { distinct?: string[] }) =>
        Promise.resolve(
          args.distinct ? [{ attributionWork: 'Бхагавад-гита' }] : [],
        ),
    );

    const page = await service.feed('user-1', { work: 'Веды' });

    expect(page.items).toEqual([]);
    const light = findCall(
      motivationPost.findMany,
      (args) => args.select && !args.distinct,
    );
    expect(light.where.attributionWork).toEqual({ in: [] });
  });

  it('filters by speaker chronologically without verse order', async () => {
    const { service, motivationPost } = build(day(10), [
      post('a', day(12), null),
    ]);
    motivationPost.findMany.mockImplementation(
      (args: { distinct?: string[] }) =>
        Promise.resolve(
          args.distinct
            ? [{ attributionSpeaker: 'Шрила Прабхупада' }]
            : [post('a', day(12), null)],
        ),
    );

    const page = await service.feed('user-1', { speaker: 'шрила прабхупада' });

    expect(page.items.map((item) => item.id)).toEqual(['a']);
    expect(page.items[0]).not.toHaveProperty('feedTier');
    const main = findCall(motivationPost.findMany, (args) => args.include);
    expect(main.where.attributionSpeaker).toEqual({
      in: ['Шрила Прабхупада'],
    });
    expect(main.orderBy).toEqual([{ publishedAt: 'desc' }, { id: 'desc' }]);
  });

  it('keeps verses of one book in order inside a tier of the personal feed', async () => {
    const verse = (
      id: string,
      publishedAt: Date,
      viewedAt: Date | null,
      locator: string,
    ) => ({
      ...post(id, publishedAt, viewedAt),
      attributionWork: 'Бхагавад-гита',
      attributionLocator: locator,
    });
    const { service } = build(day(10), [
      verse('fresh214', day(13), null, '2.14'),
      verse('fresh213', day(12), null, '2.13'),
      verse('seen101', day(1), day(2), '1.1'),
    ]);

    const page = await service.feed('user-1', {});

    expect(page.items.map((item) => `${item.feedTier}:${item.id}`)).toEqual([
      'fresh:fresh213',
      'fresh:fresh214',
      // Ранний, но уже виденный стих не перепрыгивает в «свежее».
      'seen:seen101',
    ]);
  });

  it('lists speakers and works with counts, merged across spellings', async () => {
    const { service, motivationPost } = build(day(10), []);
    const groupBy = jest.fn(
      (args: { by: string[]; where: Record<string, unknown> }) =>
        Promise.resolve(
          args.by[0] === 'attributionWork'
            ? [
                { attributionWork: 'Бхагавад-гита', _count: { _all: 4 } },
                { attributionWork: 'бхагавад-гита', _count: { _all: 1 } },
                { attributionWork: 'Упанишады', _count: { _all: 2 } },
              ]
            : [{ attributionSpeaker: 'Шрила Прабхупада', _count: { _all: 3 } }],
        ),
    );
    Object.assign(motivationPost, { groupBy });
    motivationPost.findMany.mockResolvedValue([
      { attributionSpeaker: 'Шрила Прабхупада' },
    ]);

    const result = await service.feedAttributions({
      style: 'cards',
      category: 'vedy',
      speaker: 'Шрила  Прабхупада',
    });

    expect(result).toEqual({
      speakers: [{ label: 'Шрила Прабхупада', count: 3 }],
      works: [
        { label: 'Бхагавад-гита', count: 5 },
        { label: 'Упанишады', count: 2 },
      ],
    });
    const works = groupBy.mock.calls.find(
      ([args]) => args.by[0] === 'attributionWork',
    )![0];
    // Выбранный автор сужает список источников; видимость — как у ленты.
    expect(works.where).toMatchObject({
      status: 'published',
      category: 'vedy',
      captionInImage: true,
      attributionSpeaker: { in: ['Шрила Прабхупада'] },
      attributionWork: { not: null },
    });
    const speakers = groupBy.mock.calls.find(
      ([args]) => args.by[0] === 'attributionSpeaker',
    )![0];
    expect(speakers.where).toMatchObject({ attributionSpeaker: { not: null } });
  });

  // VED-252: список одинаков у всех — второе открытие фильтра не считает
  // заново, а другое написание того же автора попадает в тот же ответ.
  it('answers the same attributions query from memory', async () => {
    const { service, motivationPost } = build(day(10), []);
    const groupBy = jest.fn().mockResolvedValue([]);
    Object.assign(motivationPost, { groupBy });
    motivationPost.findMany.mockResolvedValue([]);

    await service.feedAttributions({ category: 'vedy', speaker: 'Прабхупада' });
    await service.feedAttributions({
      category: 'vedy',
      speaker: ' прабхупада ',
    });
    expect(groupBy).toHaveBeenCalledTimes(2);

    await service.feedAttributions({ category: 'praktika' });
    expect(groupBy).toHaveBeenCalledTimes(4);
  });

  it('does not record the visit from the cards tab', async () => {
    // «Свежее» считается по основной ленте: заглянув в открытки, человек не
    // должен потерять новые афоризмы «Для вас», так их и не увидев.
    const { service, motivationPreference } = build(day(10), []);

    await service.feed('user-1', { style: 'cards' });
    expect(motivationPreference.upsert).not.toHaveBeenCalled();

    await service.feed('user-1', { style: 'art' });
    expect(motivationPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { lastSeenAt: expect.any(Date) } }),
    );
  });

  it('shows the category title from the catalogue, not its slug', async () => {
    const { service, prisma } = build(day(10), [post('a', day(12), null)]);
    prisma.motivationCategory.findMany.mockResolvedValue([
      { slug: 'daily', title: 'Каждый день' },
    ]);

    const page = await service.feed('user-1', {});

    expect(page.items[0]).toMatchObject({
      category: 'daily',
      categoryTitle: 'Каждый день',
    });
  });

  // VED-120: категория видна и на странице афоризма, словами, а не слагом.
  it('gives the public post page the category title too', async () => {
    const { service, prisma, motivationPost } = build(day(10), []);
    motivationPost.findFirst.mockResolvedValue(post('a', day(12), null));
    const findUnique = jest.fn().mockResolvedValue({ title: 'Каждый день' });
    Object.assign(prisma.motivationCategory, { findUnique });

    const page = await service.publicPost('a');

    expect(findUnique).toHaveBeenCalledWith({
      where: { slug: 'daily' },
      select: { title: true },
    });
    expect(page).toMatchObject({
      category: 'daily',
      categoryTitle: 'Каждый день',
    });
  });

  it('falls back to the slug when the catalogue does not know it', async () => {
    const { service } = build(day(10), [post('a', day(12), null)]);

    const page = await service.feed('user-1', {});

    expect(page.items[0].categoryTitle).toBe('daily');
  });

  it('hides reels of blocked authors from the feed', async () => {
    // UserBlock — портальная модель, читать её сервису разрешено контрактом.
    const { service, prisma, motivationPost } = build(day(10), []);
    prisma.userBlock.findMany.mockResolvedValue([{ blockedId: 'author-9' }]);

    await service.feed('user-1', {});

    for (const [input] of motivationPost.findMany.mock.calls)
      expect(input.where.AND).toContainEqual({
        NOT: { authorUserId: { in: ['author-9'] } },
      });
  });

  it('keeps unverified user reels out of the shared feed but not out of favorites', async () => {
    // Решение по сервису: своя цитата без проверенного источника живёт в
    // «Мои» и по ссылке, а в «Для вас» не попадает.
    const { service, motivationPost } = build(day(10), []);

    await service.feed('user-1', {});
    for (const [input] of motivationPost.findMany.mock.calls)
      expect(input.where.AND).toContainEqual({
        NOT: {
          origin: 'user',
          sourceVerified: false,
          authorIsAdmin: false,
          captionInImage: false,
        },
      });

    motivationPost.findMany.mockClear();
    await service.feed('user-1', { favorites: true });
    for (const [input] of motivationPost.findMany.mock.calls)
      expect(input.where.AND).toEqual([]);
  });

  it('puts the requested post first so the feed opens on it', async () => {
    const target = post('target', day(3), day(2));
    const { service, prisma } = build(day(10), [
      post('a', day(12), null),
      target,
    ]);
    prisma.motivationPost.findFirst = jest.fn().mockResolvedValue(target);

    const page = await service.feed('user-1', { post: 'target' });

    expect(prisma.motivationPost.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: 'target', status: 'published' },
      }),
    );
    // Первым идёт запрошенный, и второй раз в списке он не появляется.
    expect(page.items[0].id).toBe('target');
    expect(page.items.filter((item) => item.id === 'target')).toHaveLength(1);
  });

  it('does not count a link to one reel as a visit', async () => {
    // Автор приходит сюда из мастера по кнопке «Открыть рилс». Если считать
    // это визитом, его свежая публикация в следующий раз перестанет быть
    // «свежей», так и не показавшись ему в ленте.
    const target = post('target', day(12), null);
    const { service, prisma, motivationPreference } = build(day(10), [target]);
    prisma.motivationPost.findFirst = jest.fn().mockResolvedValue(target);

    await service.feed('user-1', { post: 'target' });

    expect(motivationPreference.upsert).not.toHaveBeenCalled();
  });

  it('leaves favorites chronological without tiers', async () => {
    const { service, motivationPreference } = build(day(10), [
      post('a', day(12), null),
    ]);

    const page = await service.feed('user-1', { favorites: true });

    expect(page.items[0].feedTier).toBeUndefined();
    expect(motivationPreference.upsert).not.toHaveBeenCalled();
  });
});

describe('MotivationService.view', () => {
  function build(authorUserId: string | null) {
    const motivationView = { upsert: jest.fn().mockResolvedValue({}) };
    const prisma = {
      motivationPost: {
        findFirst: jest.fn().mockResolvedValue({ authorUserId }),
      },
      motivationView,
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
    return { service, motivationView, prisma };
  }

  it('записывает просмотр читателя', async () => {
    const { service, motivationView } = build('author-1');

    await service.view('reader-1', 'p1');

    expect(motivationView.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_postId: { userId: 'reader-1', postId: 'p1' } },
      }),
    );
  });

  it('не засчитывает автору просмотр своего рилса', async () => {
    // Иначе один взгляд на собственную публикацию — а мастер сам зовёт
    // «Открыть рилс» — уводит её в ярус «повтор», в самый хвост ленты.
    const { service, motivationView } = build('author-1');

    await service.view('author-1', 'p1');

    expect(motivationView.upsert).not.toHaveBeenCalled();
  });

  it('неопубликованного поста не знает', async () => {
    const { service, prisma } = build(null);
    prisma.motivationPost.findFirst = jest.fn().mockResolvedValue(null);

    await expect(service.view('reader-1', 'p1')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('MotivationService.like', () => {
  function build(existing: boolean) {
    const tx = {
      motivationLike: {
        findUnique: jest
          .fn()
          .mockResolvedValue(existing ? { userId: 'u' } : null),
        create: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      motivationPost: {
        update: jest.fn().mockResolvedValue({ likeCount: 5 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ likeCount: 4 }),
      },
    };
    const prisma = {
      motivationPost: {
        findFirst: jest.fn().mockResolvedValue({ id: 'p' }),
      },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
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
    return { service, tx };
  }

  it('creates the like and bumps the counter once', async () => {
    const { service, tx } = build(false);

    await expect(service.like('u', 'p', true)).resolves.toEqual({
      likeCount: 5,
      isLiked: true,
    });
    expect(tx.motivationLike.create).toHaveBeenCalled();
    expect(tx.motivationPost.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { likeCount: { increment: 1 } } }),
    );
  });

  it('does not double-count a repeated like', async () => {
    const { service, tx } = build(true);

    await expect(service.like('u', 'p', true)).resolves.toEqual({
      likeCount: 4,
      isLiked: true,
    });
    expect(tx.motivationLike.create).not.toHaveBeenCalled();
    expect(tx.motivationPost.update).not.toHaveBeenCalled();
  });

  it('removes the like and decrements only when it existed', async () => {
    const { service, tx } = build(true);

    await service.like('u', 'p', false);

    expect(tx.motivationLike.delete).toHaveBeenCalled();
    expect(tx.motivationPost.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { likeCount: { decrement: 1 } } }),
    );
  });
});

describe('MotivationService.report', () => {
  function build(
    options: {
      count?: number;
      threshold?: number;
      post?: Record<string, unknown> | null;
    } = {},
  ) {
    const prisma = {
      motivationPost: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            options.post === undefined
              ? { id: 'post-1', origin: 'user', authorUserId: 'author-1' }
              : options.post,
          ),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      motivationReport: {
        upsert: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(options.count ?? 1),
      },
      motivationModerationAudit: { create: jest.fn().mockResolvedValue({}) },
    };
    const settings = {
      read: jest
        .fn()
        .mockResolvedValue({ reportsToHide: options.threshold ?? 3 }),
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
      settings as never,
    );
    return { service, prisma };
  }

  it('records one report per person without hiding the reel yet', async () => {
    const { service, prisma } = build({ count: 1 });

    await expect(
      service.report('user-2', 'post-1', { reason: 'spam' }),
    ).resolves.toEqual({ count: 1, hidden: false });
    expect(prisma.motivationReport.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: {} }),
    );
    expect(prisma.motivationPost.updateMany).not.toHaveBeenCalled();
  });

  it('hides the reel once the threshold is reached and writes an audit', async () => {
    const { service, prisma } = build({ count: 3, threshold: 3 });

    await expect(
      service.report('user-2', 'post-1', { reason: 'offensive' }),
    ).resolves.toEqual({ count: 3, hidden: true });
    expect(prisma.motivationPost.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'hidden', generationStage: 'hidden' },
      }),
    );
    expect(prisma.motivationModerationAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'auto_hidden', actorId: null }),
      }),
    );
  });

  it('refuses an unknown reason, editorial posts and self-reports', async () => {
    const { service } = build();
    await expect(
      service.report('user-2', 'post-1', { reason: 'whatever' as never }),
    ).rejects.toThrow('причину');

    const editorial = build({
      post: { id: 'post-1', origin: 'editorial', authorUserId: null },
    });
    await expect(
      editorial.service.report('user-2', 'post-1', { reason: 'spam' }),
    ).rejects.toThrow('поддержку');

    const own = build({
      post: { id: 'post-1', origin: 'user', authorUserId: 'user-2' },
    });
    await expect(
      own.service.report('user-2', 'post-1', { reason: 'spam' }),
    ).rejects.toThrow('ваш собственный');
  });
});

describe('MotivationService.savePreference', () => {
  function buildService(existingSlugs: string[] = []) {
    const upsert = jest.fn().mockResolvedValue({});
    const findUnique = jest.fn(({ where }: { where: { slug: string } }) =>
      Promise.resolve(existingSlugs.includes(where.slug) ? { id: 'c1' } : null),
    );
    const service = new MotivationService(
      {
        motivationPreference: { upsert },
        motivationCategory: { findUnique },
      } as never,
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

  // VED-401: кнопки «Вдохновения» на главной.
  it('stores the home buttons picked by the member', async () => {
    const { service, upsert } = buildService(['vedy']);

    await service.savePreference('user-1', {
      homeSourceWork: '  Шримад-Бхагаватам ',
      homeCategorySlug: 'vedy',
    });

    expect(upsert.mock.calls[0][0].update).toEqual({
      homeSourceWork: 'Шримад-Бхагаватам',
      homeCategorySlug: 'vedy',
    });
    expect(upsert.mock.calls[0][0].create).toMatchObject({
      homeSourceWork: 'Шримад-Бхагаватам',
      homeCategorySlug: 'vedy',
    });
  });

  it('returns a home button to its default on null or empty string', async () => {
    const { service, upsert } = buildService();

    await service.savePreference('user-1', {
      homeSourceWork: '',
      homeCategorySlug: null,
    });

    expect(upsert.mock.calls[0][0].update).toEqual({
      homeSourceWork: null,
      homeCategorySlug: null,
    });
  });

  it('leaves the home buttons untouched when the fields are absent', async () => {
    const { service, upsert } = buildService();

    await service.savePreference('user-1', { language: 'en' });

    expect(upsert.mock.calls[0][0].update).not.toHaveProperty('homeSourceWork');
    expect(upsert.mock.calls[0][0].update).not.toHaveProperty(
      'homeCategorySlug',
    );
  });

  it('rejects a folder that does not exist', async () => {
    const { service, upsert } = buildService(['vedy']);

    await expect(
      service.savePreference('user-1', { homeCategorySlug: 'nety-takoy' }),
    ).rejects.toThrow('Такого раздела нет');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejects a malformed home button value', async () => {
    const { service } = buildService();

    await expect(
      service.savePreference('user-1', { homeCategorySlug: 'Мудрость мира' }),
    ).rejects.toThrow('Некорректные настройки');
    await expect(
      service.savePreference('user-1', { homeSourceWork: 5 as never }),
    ).rejects.toThrow('Некорректные настройки');
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

    await service.adminDelete(admin, 'post-1');

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

    await service.adminDelete(admin, 'post-1');

    expect(transaction.motivationPost.delete).toHaveBeenCalled();
    expect(transaction.motivationQuote.delete).not.toHaveBeenCalled();
  });

  it('reports a missing post instead of deleting nothing quietly', async () => {
    const { service } = buildService(null);

    await expect(service.adminDelete(admin, 'ghost')).rejects.toThrow(
      'Motivation post not found',
    );
  });

  it('requires an admin or service-admin role', async () => {
    const { service } = buildService({ id: 'post-1', quoteId: 'quote-1' });

    await expect(service.adminDelete(regularUser, 'post-1')).rejects.toThrow();
  });

  it('allows a service-admin scoped to motivation', async () => {
    const { service, transaction } = buildService({
      id: 'post-1',
      quoteId: 'quote-1',
    });

    await service.adminDelete(motivationServiceAdmin, 'post-1');

    expect(transaction.motivationPost.delete).toHaveBeenCalledWith({
      where: { id: 'post-1' },
    });
  });

  it('rejects a service-admin scoped to a different service', async () => {
    const { service, transaction } = buildService({
      id: 'post-1',
      quoteId: 'quote-1',
    });

    await expect(
      service.adminDelete(otherServiceAdmin, 'post-1'),
    ).rejects.toThrow();
    expect(transaction.motivationPost.delete).not.toHaveBeenCalled();
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

    await expect(service.addManualQuote(admin, validInput)).resolves.toEqual({
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

    await service.addManualQuote(admin, {
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

    await service.addManualQuote(admin, {
      ...validInput,
      category: 'smirenie',
    });

    expect(categories.resolveSlug).toHaveBeenCalledWith('smirenie', 'art');
    expect(
      (copy as { prepareCandidate: jest.Mock }).prepareCandidate,
    ).toHaveBeenCalledWith('quote-1', 'smirenie');
  });

  it('trims input and stores an optional source URL', async () => {
    const { service, prisma } = buildService();

    await service.addManualQuote(admin, {
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

    await expect(service.addManualQuote(admin, validInput)).rejects.toThrow(
      'This quote has already been added',
    );
    expect(prisma.motivationQuote.create).not.toHaveBeenCalled();
    expect(copy.prepareCandidate).not.toHaveBeenCalled();
  });

  it('rejects missing required fields', async () => {
    const { service } = buildService();

    await expect(
      service.addManualQuote(admin, { ...validInput, author: '   ' }),
    ).rejects.toThrow('Quote text, language and author are required');
  });

  it('requires an admin or service-admin role', async () => {
    const { service } = buildService();

    await expect(
      service.addManualQuote(regularUser, validInput),
    ).rejects.toThrow();
  });

  it('allows a service-admin scoped to motivation', async () => {
    const { service, copy } = buildService();

    await expect(
      service.addManualQuote(motivationServiceAdmin, validInput),
    ).resolves.toEqual({ quoteId: 'quote-1', postId: 'post-1' });
    expect(
      (copy as { prepareCandidate: jest.Mock }).prepareCandidate,
    ).toHaveBeenCalled();
  });

  it('rejects a service-admin scoped to a different service', async () => {
    const { service, copy } = buildService();

    await expect(
      service.addManualQuote(otherServiceAdmin, validInput),
    ).rejects.toThrow();
    expect(
      (copy as { prepareCandidate: jest.Mock }).prepareCandidate,
    ).not.toHaveBeenCalled();
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

    await expect(service.previewVoice(admin, 'Rachel')).resolves.toEqual({
      audio: 'https://cdn/Rachel.mp3',
      cached: true,
    });
    // Каждый синтез стоит денег, а фраза и голос те же — платить дважды не за что.
    expect(audio.speak).not.toHaveBeenCalled();
  });

  it('отсутствующий синтезирует и кладёт в хранилище', async () => {
    const { service, audio, generation } = build(null);

    await expect(service.previewVoice(admin, 'George')).resolves.toEqual({
      audio: 'https://cdn/new.mp3',
      cached: false,
    });
    expect(audio.speak).toHaveBeenCalled();
    expect(generation.uploadStory).toHaveBeenCalledWith(
      'motivation/voice-preview/fal-ai-elevenlabs-tts-eleven-v3/v2/George.mp3',
      expect.any(Buffer),
      'audio/mpeg',
    );
  });

  it('неизвестный голос отбивает до обращения к провайдеру', async () => {
    const { service, audio } = build(null);

    await expect(service.previewVoice(admin, 'Валера')).rejects.toThrow();
    // За неизвестный голос провайдер списал бы деньги так же, как за верный.
    expect(audio.speak).not.toHaveBeenCalled();
  });

  it('пускает service-admin, которому выдан сервис motivation', async () => {
    const { service } = build('https://cdn/Rachel.mp3');

    await expect(
      service.previewVoice(motivationServiceAdmin, 'Rachel'),
    ).resolves.toEqual({ audio: 'https://cdn/Rachel.mp3', cached: true });
  });

  it('не пускает service-admin другого сервиса', async () => {
    const { service, audio } = build('https://cdn/Rachel.mp3');

    await expect(
      service.previewVoice(otherServiceAdmin, 'Rachel'),
    ).rejects.toThrow();
    expect(audio.speak).not.toHaveBeenCalled();
  });
});

describe('MotivationService.stats', () => {
  it('считает всё опубликованное, а не то, что видит спрашивающий', async () => {
    const count = jest.fn().mockResolvedValue(348);
    const service = new MotivationService(
      { motivationPost: { count } } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    expect(await service.stats()).toEqual({ published: 348 });
    // Настройки направлений у каждого свои, и число, меняющееся от галочки
    // в настройках, читалось бы как пропажа публикаций, — поэтому подбора под
    // путь здесь нет. А вот рилс участника без проверенного источника читателю
    // недоступен ни одним путём: считать его значило обещать больше, чем есть,
    // и расходиться с числами у папок, которые его уже не считали.
    expect(count).toHaveBeenCalledWith({
      where: {
        status: 'published',
        NOT: {
          origin: 'user',
          sourceVerified: false,
          authorIsAdmin: false,
          captionInImage: false,
        },
      },
    });
  });
});

describe('MotivationService.adminUpdate', () => {
  function build() {
    const update = jest.fn().mockResolvedValue({ id: 'post-1' });
    const upsert = jest.fn().mockResolvedValue({});
    /* Прежний текст нужен, чтобы понять, тронули ли пояснение: переписал
       трактовку — стал её автором. Здесь до правки пояснения не было. */
    const findUnique = jest.fn().mockResolvedValue({ text: 'Было' });
    const service = new MotivationService(
      {
        motivationPost: { update },
        motivationPostTranslation: { upsert, findUnique },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, update, upsert, findUnique };
  }

  const admin = { sub: 'admin-1', role: 'admin' } as never;

  it('переписал пояснение — стал его автором', async () => {
    const { service, update, findUnique } = build();
    findUnique.mockResolvedValue({ text: 'Цитата\n\nСтарое пояснение' });

    await service.adminUpdate(admin, 'post-1', {
      translations: {
        ru: {
          title: 'Заголовок',
          text: 'Цитата\n\nНовое пояснение',
          storyText: 'Подпись',
        },
      },
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      data: { explanationAuthorId: 'admin-1' },
    });
  });

  it('правка самой цитаты автором пояснения не делает', async () => {
    const { service, update, findUnique } = build();
    findUnique.mockResolvedValue({ text: 'Цитата\n\nПояснение' });
    update.mockClear();

    await service.adminUpdate(admin, 'post-1', {
      translations: {
        ru: {
          title: 'Заголовок',
          text: 'Цитата с опечаткой\n\nПояснение',
          storyText: 'Подпись',
        },
      },
    });

    // Один вызов — сама карточка; второго, с авторством, быть не должно.
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('пишет тексты, а не молча возвращает 200', async () => {
    const { service, upsert } = build();

    await service.adminUpdate(admin, 'post-1', {
      translations: {
        ru: { title: 'Заголовок', text: 'Текст', storyText: 'Подпись' },
      },
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { postId_language: { postId: 'post-1', language: 'ru' } },
        update: { title: 'Заголовок', text: 'Текст', storyText: 'Подпись' },
      }),
    );
  });

  // VED-199: заголовка и подписи в форме нет — прежние не затираются.
  it('без заголовка и подписи для Stories оставляет прежние', async () => {
    const { service, upsert } = build();

    await service.adminUpdate(admin, 'post-1', {
      translations: { ru: { text: 'Цитата' } },
    });

    expect(upsert.mock.calls[0][0].update).toEqual({ text: 'Цитата' });
    // Новому переводу пустых полей не бывает — собираем их из цитаты.
    expect(upsert.mock.calls[0][0].create).toMatchObject({
      title: 'Цитата',
      storyText: 'Цитата',
    });
  });

  it('заголовок, собранный из цитаты, идёт вслед за ней', async () => {
    const { service, upsert, findUnique } = build();
    findUnique.mockResolvedValue({
      text: 'Старая цитата\n\nПояснение',
      title: 'Старая цитата',
    });

    await service.adminUpdate(admin, 'post-1', {
      translations: { ru: { text: 'Новая цитата\n\nПояснение' } },
    });

    expect(upsert.mock.calls[0][0].update).toMatchObject({
      title: 'Новая цитата',
    });
  });

  it('заголовок, написанный руками, правка цитаты не трогает', async () => {
    const { service, upsert, findUnique } = build();
    findUnique.mockResolvedValue({
      text: 'Старая цитата',
      title: 'Душа вечна',
    });

    await service.adminUpdate(admin, 'post-1', {
      translations: { ru: { text: 'Новая цитата' } },
    });

    expect(upsert.mock.calls[0][0].update).not.toHaveProperty('title');
  });

  // VED-241: текст на картинке правится отдельно от полного.
  it('пишет текст на картинке, а пустой — сбрасывает к цитате', async () => {
    const { service, upsert } = build();

    await service.adminUpdate(admin, 'post-1', {
      translations: {
        ru: { text: 'Длинная цитата\n\nПояснение', imageText: ' Короче ' },
      },
    });
    await service.adminUpdate(admin, 'post-1', {
      translations: { ru: { text: 'Длинная цитата', imageText: '  ' } },
    });

    expect(upsert.mock.calls[0][0].update).toMatchObject({
      imageText: 'Короче',
    });
    expect(upsert.mock.calls[1][0].update).toMatchObject({ imageText: null });
  });

  it('не присланный текст на картинке не трогает', async () => {
    const { service, upsert } = build();

    await service.adminUpdate(admin, 'post-1', {
      translations: { ru: { text: 'Цитата' } },
    });

    expect(upsert.mock.calls[0][0].update).not.toHaveProperty('imageText');
    expect(upsert.mock.calls[0][0].create).not.toHaveProperty('imageText');
  });

  it('правка подписи снимает отметку о проверке источника', async () => {
    const { service, update } = build();

    await service.adminUpdate(admin, 'post-1', {
      attribution: { speaker: ' Прабхупада ', work: 'Гита', locator: '2.13' },
    });

    // Отметка относилась к тому, что сверяли, а не к тому, что переписали.
    expect(update.mock.calls[0][0].data).toMatchObject({
      attributionSpeaker: 'Прабхупада',
      attributionWork: 'Гита',
      attributionLocator: '2.13',
      sourceVerified: false,
    });
  });

  it('пустая подпись стирается, а не сохраняется пробелами', async () => {
    const { service, update } = build();

    await service.adminUpdate(admin, 'post-1', {
      attribution: { speaker: '  ', work: null, locator: undefined },
    });

    expect(update.mock.calls[0][0].data).toMatchObject({
      attributionSpeaker: null,
      attributionWork: null,
      attributionLocator: null,
    });
  });

  it('без правки подписи отметку о проверке не трогает', async () => {
    const { service, update } = build();

    await service.adminUpdate(admin, 'post-1', { hidden: true });

    expect(update.mock.calls[0][0].data).not.toHaveProperty('sourceVerified');
  });
});

describe('MotivationService.deleteOwn', () => {
  /** Сервис собирается позиционно: методу удаления нужна одна только Prisma. */
  const build = (prisma: unknown) =>
    new MotivationService(
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

  it('убирает свой рилс вместе с его цитатой', async () => {
    const del = jest.fn().mockResolvedValue({});
    const quoteDelete = jest.fn().mockResolvedValue({});
    const prisma = {
      motivationPost: {
        findFirst: jest.fn().mockResolvedValue({ id: 'p1', quoteId: 'q1' }),
        delete: del,
      },
      motivationQuote: { delete: quoteDelete },
      $transaction: (run: (tx: unknown) => unknown) =>
        run({
          motivationPost: { delete: del },
          motivationQuote: { delete: quoteDelete },
        }),
    };
    await build(prisma).deleteOwn('user-1', 'p1');

    expect(prisma.motivationPost.findFirst).toHaveBeenCalledWith({
      where: { id: 'p1', authorUserId: 'user-1', origin: 'user' },
      select: { id: true, quoteId: true },
    });
    expect(del).toHaveBeenCalledWith({ where: { id: 'p1' } });
    expect(quoteDelete).toHaveBeenCalledWith({ where: { id: 'q1' } });
  });

  it('пост без своей цитаты удаляет, а чужую не трогает', async () => {
    const quoteDelete = jest.fn();
    const prisma = {
      motivationPost: {
        findFirst: jest.fn().mockResolvedValue({ id: 'p1', quoteId: null }),
      },
      $transaction: (run: (tx: unknown) => unknown) =>
        run({
          motivationPost: { delete: jest.fn().mockResolvedValue({}) },
          motivationQuote: { delete: quoteDelete },
        }),
    };
    await build(prisma).deleteOwn('user-1', 'p1');

    expect(quoteDelete).not.toHaveBeenCalled();
  });

  it('чужой пост — «не найдено», а не «нельзя»: иначе перебор идентификаторов выдал бы, что за ними стоит', async () => {
    const prisma = {
      motivationPost: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(),
    };
    await expect(
      build(prisma).deleteOwn('user-1', 'p1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
