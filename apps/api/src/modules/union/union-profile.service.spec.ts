import type {
  UnionPhoto,
  UnionProfileUpdateRequest,
  UnionRecommendation,
  UnionSwipeDecision,
} from '@vedamatch/shared';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserGalleryService } from '../users/user-gallery.service';
import { ModerationService } from '../moderation/moderation.service';
import { MotivationGenerationService } from '../motivation/motivation-generation.service';
import { UnionArchiveService } from './union-archive.service';
import { UnionBoostService } from './union-boost.service';
import { UnionConnectionService } from './union-connection.service';
import { UnionMatchingService } from './union-matching.service';
import { UnionProfileService } from './union-profile.service';
import { UnionSwipeService } from './union-swipe.service';
import {
  birthDateBoundsForAge,
  buildRecommendationCandidateWhere,
  RECOMMENDATION_CANDIDATE_LIMIT,
} from './union-profile.service';

const createdAt = new Date('2026-07-10T10:00:00.000Z');

const defaultLocation = {
  city: 'Москва',
  country: 'Россия',
  lat: 55.7558,
  lon: 37.6176,
};

function photo(
  id: string,
  sortOrder = 0,
  isPublic = true,
  photoCreatedAt = createdAt,
) {
  return {
    id,
    userId: 'other',
    storageKey: `${id}.webp`,
    sizeBytes: 1024,
    width: id === 'photo-2' ? 800 : 1200,
    height: id === 'photo-2' ? 1200 : 800,
    isPublic,
    sortOrder,
    createdAt: photoCreatedAt,
    updatedAt: photoCreatedAt,
  };
}

function user(
  id: string,
  homeLocation: unknown = defaultLocation,
  options: {
    avatarUrl?: string | null;
    photos?: ReturnType<typeof photo>[];
    spiritualName?: string | null;
  } = {},
) {
  return {
    id,
    email: `${id}@example.com`,
    name: id,
    spiritualName: options.spiritualName ?? null,
    avatarUrl: options.avatarUrl ?? null,
    avatarKey: null,
    // Рассказ и языки — портальные: анкета Знакомств читает их отсюда.
    about: null,
    languages: [],
    homeLocation,
    socialLinks: { website: `https://${id}.example.com` },
    messengers: { telegram: `@${id}` },
    role: 'user',
    googleId: null,
    spiritualStage: null,
    devoteeVerificationStatus: null,
    lastSelfIdentificationAt: null,
    createdAt,
    updatedAt: createdAt,
    photos: options.photos ?? [],
  };
}

function profile(
  userId: string,
  options: {
    isActive?: boolean;
    contacts?: string;
    homeLocation?: unknown;
    photoPrivacy?: string;
    avatarUrl?: string | null;
    photos?: ReturnType<typeof photo>[];
  } = {},
) {
  return {
    id: `profile-${userId}`,
    userId,
    relocationReady: false,
    format: 'any',
    skills: [],
    interests: [],
    values: [],
    familyStatus: null,
    status: null,
    heightCm: null,
    diet: null,
    regulativePrinciples: [],
    childrenStatus: null,
    education: null,
    spiritualEducation: null,
    housing: null,
    income: null,
    pets: [],
    ageRangeMin: null,
    ageRangeMax: null,
    privacy:
      options.contacts || options.photoPrivacy
        ? {
            ...(options.contacts ? { contacts: options.contacts } : {}),
            ...(options.photoPrivacy ? { photo: options.photoPrivacy } : {}),
          }
        : null,
    isActive: options.isActive ?? true,
    createdAt,
    updatedAt: createdAt,
    intentions: [
      {
        id: `intention-${userId}`,
        profileId: `profile-${userId}`,
        type: 'friendship',
        weight: 100,
      },
    ],
    user: user(
      userId,
      options.homeLocation === undefined
        ? defaultLocation
        : options.homeLocation,
      { avatarUrl: options.avatarUrl, photos: options.photos },
    ),
  };
}

function withStage(
  source: ReturnType<typeof profile>,
  spiritualStage: string,
  devoteeVerificationStatus: string,
) {
  return {
    ...source,
    user: { ...source.user, spiritualStage, devoteeVerificationStatus },
  };
}

function withGender(
  source: ReturnType<typeof profile>,
  gender: 'male' | 'female' | null,
) {
  return { ...source, user: { ...source.user, gender } };
}

function withIntentions(
  source: ReturnType<typeof profile>,
  entries: Array<{
    type: 'family' | 'business' | 'friendship' | 'service';
    weight: number;
  }>,
) {
  return {
    ...source,
    intentions: entries.map((entry, index) => ({
      id: `intention-${source.userId}-${index}`,
      profileId: source.id,
      type: entry.type,
      weight: entry.weight,
    })),
  };
}

function withBirthYear(source: ReturnType<typeof profile>, year: number) {
  return {
    ...source,
    user: { ...source.user, birthDate: new Date(`${year}-01-01T00:00:00Z`) },
  };
}

// Фикстура профиля выводится с литеральными типами (diet: null и т.п.),
// поэтому переопределения принимаем как свободный набор полей.
function withDetails(
  source: ReturnType<typeof profile>,
  details: Record<string, unknown>,
) {
  return { ...source, ...details };
}

function connection(status: 'pending' | 'accepted' = 'accepted') {
  return {
    id: 'connection-1',
    fromUserId: 'me',
    toUserId: 'other',
    status,
    message: null,
    createdAt,
    respondedAt: status === 'accepted' ? createdAt : null,
  };
}

const validProfileBody: UnionProfileUpdateRequest = {
  intentions: [{ type: 'friendship', weight: 100 }],
};

describe('UnionProfileService', () => {
  const profileUpsert = jest.fn();
  const findSavedProfile = jest.fn();
  const transaction = {
    unionProfile: {
      upsert: profileUpsert,
      findUniqueOrThrow: findSavedProfile,
    },
    unionIntention: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
  };
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
    unionProfile: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    userPhoto: {
      count: jest.fn(() => Promise.resolve(0)),
    },
    unionConnectionRequest: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    unionSwipe: {
      findMany: jest.fn(() =>
        Promise.resolve(
          [] as Array<{ toUserId: string; decision?: UnionSwipeDecision }>,
        ),
      ),
    },
    unionBoost: {
      findMany: jest.fn(() => Promise.resolve([] as { userId: string }[])),
    },
    unionArchive: {
      findMany: jest.fn(() =>
        Promise.resolve([] as { archivedUserId: string }[]),
      ),
    },
    $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) =>
      callback(transaction),
    ),
  };
  const matching = {
    computeCompatibility: jest.fn(() => ({ total: 50, breakdown: [] })),
  };
  const gallery = {
    signPublicPhotos: jest.fn(
      (
        photos: Array<{
          id: string;
          storageKey: string;
          width: number;
          height: number;
        }>,
      ): Promise<UnionPhoto[]> =>
        Promise.resolve(
          photos.map(({ id, width, height }) => ({
            id,
            url: `signed-${id.replace('photo-', '')}`,
            width,
            height,
          })),
        ),
    ),
  };
  const moderation = {
    hiddenUserIds: jest.fn().mockResolvedValue(new Set<string>()),
    isHidden: jest.fn().mockResolvedValue(false),
  };
  const generation = {
    generatePlainText: jest.fn().mockResolvedValue('generated text'),
  };
  const users = {
    resolveAvatarUrl: jest.fn(
      async (u: { avatarKey: string | null; avatarUrl: string | null }) =>
        u.avatarKey ? 'https://signed.example/avatar' : u.avatarUrl,
    ),
  };
  const service = new UnionProfileService(
    prisma as unknown as PrismaService,
    matching as unknown as UnionMatchingService,
    gallery as unknown as UserGalleryService,
    moderation as unknown as ModerationService,
    generation as unknown as MotivationGenerationService,
    users as never,
    // Свайпы и бусты — настоящие сервисы поверх того же мока Prisma: так
    // тесты выдачи проверяют реальные запросы, а не ещё один слой моков.
    new UnionSwipeService(
      prisma as unknown as PrismaService,
      {} as UnionConnectionService,
    ),
    new UnionBoostService(prisma as unknown as PrismaService),
    new UnionArchiveService(prisma as unknown as PrismaService),
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.userPhoto.count.mockResolvedValue(0);
    prisma.user.findUnique.mockResolvedValue(user('me'));
    prisma.unionSwipe.findMany.mockResolvedValue([]);
    prisma.unionBoost.findMany.mockResolvedValue([]);
    prisma.unionArchive.findMany.mockResolvedValue([]);
    moderation.hiddenUserIds.mockResolvedValue(new Set<string>());
    moderation.isHidden.mockResolvedValue(false);
  });

  it('requires a complete location before creating a Union profile', async () => {
    prisma.user.findUnique.mockResolvedValue(user('me', null));

    await expect(service.upsertProfile('me', validProfileBody)).rejects.toThrow(
      'Укажите страну и город перед использованием Union',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires a complete location before loading recommendations', async () => {
    prisma.unionProfile.findUnique.mockResolvedValue({
      ...profile('me'),
      user: user('me', null),
    });

    await expect(service.getRecommendations('me')).rejects.toThrow(
      'Укажите страну и город перед использованием Union',
    );
    expect(prisma.unionProfile.findMany).not.toHaveBeenCalled();
  });

  it('excludes profiles without a complete location from recommendations', async () => {
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    prisma.unionProfile.findMany.mockResolvedValue([
      profile('other', { homeLocation: null }),
    ]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('me');

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('подписывает карточку духовным именем, когда оно заполнено', async () => {
    const other = profile('other');
    other.user = user('other', defaultLocation, {
      spiritualName: 'Мадхава дас',
    });
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    prisma.unionProfile.findMany.mockResolvedValue([other]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('me');

    expect(result.items[0].user.name).toBe('Мадхава дас');
  });

  it('без духовного имени в карточке остаётся обычное', async () => {
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    prisma.unionProfile.findMany.mockResolvedValue([profile('other')]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('me');

    expect(result.items[0].user.name).toBe('other');
  });

  it('keeps swiped profiles out of the deck', async () => {
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    prisma.unionProfile.findMany.mockResolvedValue([
      profile('seen'),
      profile('fresh'),
    ]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);
    prisma.unionSwipe.findMany.mockResolvedValue([{ toUserId: 'seen' }]);

    const result = await service.getRecommendations('me');

    expect(result.items.map((item) => item.user.id)).toEqual(['fresh']);
  });

  /*
    «Показать всех» — не пятый чип целей, а обещание. Оно нарушалось молча:
    человек читал «Все · 4» при двенадцати анкетах и искал остальных в
    фильтрах экрана, где их не было, — резали история показов, желаемый
    возраст партнёра из анкеты и пол под целью «Создание семьи».
  */
  describe('showAll', () => {
    beforeEach(() => {
      prisma.unionConnectionRequest.findMany.mockResolvedValue([]);
    });

    it('возвращает в выдачу уже отсмотренных', async () => {
      prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
      prisma.unionProfile.findMany.mockResolvedValue([
        profile('seen'),
        profile('fresh'),
      ]);
      prisma.unionSwipe.findMany.mockResolvedValue([{ toUserId: 'seen' }]);

      const result = await service.getRecommendations('me', { showAll: true });

      expect(result.items.map((item) => item.user.id).sort()).toEqual([
        'fresh',
        'seen',
      ]);
    });

    it('называет решение по отсмотренной анкете', async () => {
      // Иначе человек решает второй раз вслепую: ставит лайк тому, кому
      // запрос уже отправлен, и ждёт ответа дважды.
      prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
      prisma.unionProfile.findMany.mockResolvedValue([profile('seen')]);
      prisma.unionSwipe.findMany.mockResolvedValue([
        { toUserId: 'seen', decision: 'like' },
      ]);

      const result = await service.getRecommendations('me', { showAll: true });

      expect(result.items[0].myDecision).toBe('like');
    });

    it('по анкете без решения пометки нет', async () => {
      prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
      prisma.unionProfile.findMany.mockResolvedValue([profile('fresh')]);
      prisma.unionSwipe.findMany.mockResolvedValue([]);

      const result = await service.getRecommendations('me', { showAll: true });

      expect(result.items[0].myDecision).toBeNull();
    });

    it('снимает мой диапазон возраста партнёра из анкеты', async () => {
      // Он стоит в анкете, а режет ленту — на экране фильтров его нет вовсе.
      const me = withDetails(profile('me'), {
        ageRangeMin: 30,
        ageRangeMax: 40,
      });
      prisma.unionProfile.findUnique.mockResolvedValue(me);
      prisma.unionProfile.findMany.mockResolvedValue([
        withBirthYear(profile('older'), 1960),
      ]);
      prisma.unionSwipe.findMany.mockResolvedValue([]);

      const narrowed = await service.getRecommendations('me');
      const everyone = await service.getRecommendations('me', {
        showAll: true,
      });

      expect(narrowed.items).toEqual([]);
      expect(everyone.items.map((item) => item.user.id)).toEqual(['older']);
    });

    it('не тащит мой диапазон возраста в запрос к базе', async () => {
      // Проверка не для красоты: то же сужение продублировано в SQL, и без
      // него JS-фильтр снял бы ограничение, а строк из базы всё равно не
      // пришло бы.
      prisma.unionProfile.findUnique.mockResolvedValue(
        withDetails(profile('me'), { ageRangeMin: 30, ageRangeMax: 40 }),
      );
      prisma.unionProfile.findMany.mockResolvedValue([]);
      prisma.unionSwipe.findMany.mockResolvedValue([]);

      await service.getRecommendations('me', { showAll: true });

      const where = (
        prisma.unionProfile.findMany.mock.calls as unknown as [
          { where: { AND?: unknown[] } },
        ][]
      )[0][0].where;
      expect(where.AND ?? []).toEqual([]);
    });

    it('снимает мой отбор по полу под целью «Создание семьи»', async () => {
      const me = withDetails(
        withGender(withIntentions(profile('me'), [{ type: 'family', weight: 100 }]), 'male'),
        { familySeeksGender: 'female' },
      );
      prisma.unionProfile.findUnique.mockResolvedValue(me);
      prisma.unionProfile.findMany.mockResolvedValue([
        withGender(profile('man'), 'male'),
      ]);
      prisma.unionSwipe.findMany.mockResolvedValue([]);

      const narrowed = await service.getRecommendations('me');
      const everyone = await service.getRecommendations('me', {
        showAll: true,
      });

      expect(narrowed.items).toEqual([]);
      expect(everyone.items.map((item) => item.user.id)).toEqual(['man']);
    });

    it('чужой выбор не снимает и честно его считает', async () => {
      // Человек, который ищет семью с определённым полом, не должен попадать
      // в ленту тех, кому заведомо не подходит. Но тогда «все» обязано быть
      // проверяемым — недостачу называем числом, а не умалчиваем.
      const me = withGender(profile('me'), 'male');
      prisma.unionProfile.findUnique.mockResolvedValue(me);
      prisma.unionProfile.findMany.mockResolvedValue([
        withDetails(
          withGender(
            withIntentions(profile('picky'), [{ type: 'family', weight: 100 }]),
            'female',
          ),
          { familySeeksGender: 'female' },
        ),
        profile('open'),
      ]);
      prisma.unionSwipe.findMany.mockResolvedValue([]);

      const result = await service.getRecommendations('me', { showAll: true });

      expect(result.items.map((item) => item.user.id)).toEqual(['open']);
      expect(result.hiddenByOthers).toBe(1);
    });

    it('вне режима «все» недостачу не считает', async () => {
      // Число нужно ровно там, где обещано «все»; в обычной ленте это лишний
      // проход и лишний повод объясняться.
      prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
      prisma.unionProfile.findMany.mockResolvedValue([profile('other')]);
      prisma.unionSwipe.findMany.mockResolvedValue([]);

      const result = await service.getRecommendations('me');

      expect(result.hiddenByOthers).toBe(0);
    });
  });

  it('shows swiped profiles when includeSwiped is set', async () => {
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    prisma.unionProfile.findMany.mockResolvedValue([
      profile('seen'),
      profile('fresh'),
    ]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);
    prisma.unionSwipe.findMany.mockResolvedValue([{ toUserId: 'seen' }]);

    const result = await service.getRecommendations('me', {
      includeSwiped: true,
    });

    expect(result.items.map((item) => item.user.id).sort()).toEqual([
      'fresh',
      'seen',
    ]);
  });

  it('still hides moderated profiles when includeSwiped is set', async () => {
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    prisma.unionProfile.findMany.mockResolvedValue([
      profile('blocked'),
      profile('fresh'),
    ]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);
    moderation.hiddenUserIds.mockResolvedValue(new Set(['blocked']));

    const result = await service.getRecommendations('me', {
      includeSwiped: true,
    });

    expect(result.items.map((item) => item.user.id)).toEqual(['fresh']);
  });

  // Риск: считать архив разновидностью «отсмотренного». Тогда галочка
  // «показывать уже отсмотренных» молча отменяла бы осознанное «убрать
  // совсем», и человек снова получал бы того, кого убрал.
  it('keeps archived profiles out even when includeSwiped is set', async () => {
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    prisma.unionProfile.findMany.mockResolvedValue([
      profile('archived'),
      profile('fresh'),
    ]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);
    prisma.unionArchive.findMany.mockResolvedValue([
      { archivedUserId: 'archived' },
    ]);

    const result = await service.getRecommendations('me', {
      includeSwiped: true,
    });

    expect(result.items.map((item) => item.user.id)).toEqual(['fresh']);
  });

  it('lifts a boosted profile above a better matching one', async () => {
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    prisma.unionProfile.findMany.mockResolvedValue([
      profile('ordinary'),
      profile('boosted'),
    ]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);
    prisma.unionBoost.findMany.mockResolvedValue([{ userId: 'boosted' }]);
    matching.computeCompatibility
      .mockReturnValueOnce({ total: 90, breakdown: [] })
      .mockReturnValueOnce({ total: 10, breakdown: [] });

    const result = await service.getRecommendations('me');

    expect(result.items.map((item) => item.user.id)).toEqual([
      'boosted',
      'ordinary',
    ]);
  });

  /**
   * Единственное, что делает загрузку фото выгодной: в самой совместимости
   * фото не участвует, а карточку без снимка в ленте пролистывают не глядя.
   */
  it('опускает анкету без фото ниже анкеты с фото', async () => {
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    prisma.unionProfile.findMany.mockResolvedValue([
      profile('noPhoto'),
      profile('withPhoto', { photos: [photo('photo-1')] }),
    ]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);
    matching.computeCompatibility
      .mockReturnValueOnce({ total: 90, breakdown: [] })
      .mockReturnValueOnce({ total: 10, breakdown: [] });

    const result = await service.getRecommendations('me');

    expect(result.items.map((item) => item.user.id)).toEqual([
      'withPhoto',
      'noPhoto',
    ]);
  });

  // «Внимание» — платная подъёмная сила, она обязана перебивать всё
  // остальное, иначе за него незачем платить.
  it('буст поднимает анкету даже без фото', async () => {
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    prisma.unionProfile.findMany.mockResolvedValue([
      profile('withPhoto', { photos: [photo('photo-1')] }),
      profile('boostedNoPhoto'),
    ]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);
    prisma.unionBoost.findMany.mockResolvedValue([
      { userId: 'boostedNoPhoto' },
    ]);

    const result = await service.getRecommendations('me');

    expect(result.items[0].user.id).toBe('boostedNoPhoto');
  });

  it('sorts by profile freshness when the collection asks for new ones', async () => {
    const older = profile('older');
    const newer = {
      ...profile('newer'),
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
    };
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    prisma.unionProfile.findMany.mockResolvedValue([older, newer]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);
    matching.computeCompatibility
      .mockReturnValueOnce({ total: 95, breakdown: [] })
      .mockReturnValueOnce({ total: 20, breakdown: [] });

    const result = await service.getRecommendations('me', { sort: 'new' });

    expect(result.items.map((item) => item.user.id)).toEqual([
      'newer',
      'older',
    ]);
  });

  it('drops profiles below the requested compatibility threshold', async () => {
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    prisma.unionProfile.findMany.mockResolvedValue([
      profile('weak'),
      profile('strong'),
    ]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);
    matching.computeCompatibility
      .mockReturnValueOnce({ total: 40, breakdown: [] })
      .mockReturnValueOnce({ total: 80, breakdown: [] });

    const result = await service.getRecommendations('me', { minScore: 70 });

    expect(result.items.map((item) => item.user.id)).toEqual(['strong']);
    expect(result.total).toBe(1);
  });

  it('queries only active recommendation profiles', async () => {
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    prisma.unionProfile.findMany.mockResolvedValue([]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    await service.getRecommendations('me');

    expect(prisma.unionProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          userId: { not: 'me' },
          user: { accountStatus: 'active', pendingDeletionAt: null },
        },
        orderBy: [
          { user: { lastSeenAt: { sort: 'desc', nulls: 'last' } } },
          { createdAt: 'desc' },
        ],
        take: RECOMMENDATION_CANDIDATE_LIMIT,
      }),
    );
  });

  it('pushes swiped and hidden ids into the SQL exclusion', async () => {
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    prisma.unionProfile.findMany.mockResolvedValue([]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);
    prisma.unionSwipe.findMany.mockResolvedValue([{ toUserId: 'seen' }]);
    moderation.hiddenUserIds.mockResolvedValue(new Set(['hidden']));

    await service.getRecommendations('me');

    expect(prisma.unionProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: { not: 'me', notIn: ['seen', 'hidden'] },
        }),
      }),
    );
  });

  it('pushes explicit gender/stage/verification filters into SQL', async () => {
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    prisma.unionProfile.findMany.mockResolvedValue([]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    await service.getRecommendations('me', {
      gender: 'female',
      stage: 'devotee',
      photoVerifiedOnly: true,
      verifiedOnly: true,
      diet: 'vegetarian',
    });

    expect(prisma.unionProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          diet: 'vegetarian',
          user: {
            accountStatus: 'active',
            pendingDeletionAt: null,
            gender: 'female',
            spiritualStage: 'devotee',
            devoteeVerificationStatus: 'confirmed',
            photoVerifiedAt: { not: null },
          },
        }),
      }),
    );
  });

  it('marks only administration-confirmed devotees and can filter to them', async () => {
    const confirmed = withStage(profile('confirmed'), 'devotee', 'confirmed');
    const awaiting = withStage(
      profile('awaiting'),
      'devotee',
      'awaiting_admin',
    );
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    prisma.unionProfile.findMany.mockResolvedValue([confirmed, awaiting]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const all = await service.getRecommendations('me');
    expect(
      all.items.map((item) => [item.user.id, item.user.isVerifiedDevotee]),
    ).toEqual([
      ['confirmed', true],
      ['awaiting', false],
    ]);

    const verified = await service.getRecommendations('me', {
      verifiedOnly: true,
    });
    expect(verified.items.map((item) => item.user.id)).toEqual(['confirmed']);
  });

  it('filters recommendations by gender and hides profiles without one', async () => {
    const man = withGender(profile('man'), 'male');
    const woman = withGender(profile('woman'), 'female');
    const unset = withGender(profile('unset'), null);
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    prisma.unionProfile.findMany.mockResolvedValue([man, woman, unset]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const all = await service.getRecommendations('me');
    expect(all.items.map((item) => item.user.id)).toEqual([
      'man',
      'woman',
      'unset',
    ]);

    const females = await service.getRecommendations('me', {
      gender: 'female',
    });
    expect(females.items.map((item) => item.user.id)).toEqual(['woman']);

    const males = await service.getRecommendations('me', { gender: 'male' });
    expect(males.items.map((item) => item.user.id)).toEqual(['man']);
  });

  it('ignores an unsupported gender value instead of returning nothing', async () => {
    const man = withGender(profile('man'), 'male');
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    prisma.unionProfile.findMany.mockResolvedValue([man]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('me', {
      gender: 'other' as never,
    });

    expect(result.items.map((item) => item.user.id)).toEqual(['man']);
  });

  it('сужает ленту до выбранного пола, пока отмечена цель «Создание семьи»', async () => {
    const me = withDetails(
      withIntentions(withGender(profile('me'), 'male'), [
        { type: 'family', weight: 60 },
        { type: 'friendship', weight: 40 },
      ]),
      { familySeeksGender: 'female' },
    );
    const man = withGender(profile('man'), 'male');
    const woman = withGender(profile('woman'), 'female');
    const unset = withGender(profile('unset'), null);
    prisma.unionProfile.findUnique.mockResolvedValue(me);
    prisma.unionProfile.findMany.mockResolvedValue([man, woman, unset]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('me');

    expect(result.items.map((item) => item.user.id)).toEqual(['woman']);
  });

  it('сужает ленту независимо от того, сколько целей отмечено', async () => {
    // Раньше ограничение включал вес ≥50, и человек терял его, просто
    // отметив третью цель: галочки делят 100 поровну.
    const me = withDetails(
      withIntentions(withGender(profile('me'), 'male'), [
        { type: 'family', weight: 25 },
        { type: 'business', weight: 25 },
        { type: 'friendship', weight: 25 },
        { type: 'service', weight: 25 },
      ]),
      { familySeeksGender: 'female' },
    );
    const man = withGender(profile('man'), 'male');
    const woman = withGender(profile('woman'), 'female');
    prisma.unionProfile.findUnique.mockResolvedValue(me);
    prisma.unionProfile.findMany.mockResolvedValue([man, woman]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('me');

    expect(result.items.map((item) => item.user.id)).toEqual(['woman']);
  });

  it('снимает ограничение вместе с целью «Создание семьи»', async () => {
    const me = withDetails(
      withIntentions(withGender(profile('me'), 'male'), [
        { type: 'friendship', weight: 100 },
      ]),
      { familySeeksGender: 'female' },
    );
    const man = withGender(profile('man'), 'male');
    const woman = withGender(profile('woman'), 'female');
    prisma.unionProfile.findUnique.mockResolvedValue(me);
    prisma.unionProfile.findMany.mockResolvedValue([man, woman]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('me');

    expect(result.items.map((item) => item.user.id).sort()).toEqual([
      'man',
      'woman',
    ]);
  });

  it('не сужает ленту, когда пол не выбран', async () => {
    const me = withDetails(
      withIntentions(withGender(profile('me'), 'male'), [
        { type: 'family', weight: 100 },
      ]),
      { familySeeksGender: null },
    );
    const man = withGender(profile('man'), 'male');
    const woman = withGender(profile('woman'), 'female');
    prisma.unionProfile.findUnique.mockResolvedValue(me);
    prisma.unionProfile.findMany.mockResolvedValue([man, woman]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('me');

    expect(result.items.map((item) => item.user.id).sort()).toEqual([
      'man',
      'woman',
    ]);
  });

  it('работает и без указанного в аккаунте пола: важен выбор, а не мой пол', async () => {
    const me = withDetails(
      withIntentions(withGender(profile('me'), null), [
        { type: 'family', weight: 100 },
      ]),
      { familySeeksGender: 'female' },
    );
    const man = withGender(profile('man'), 'male');
    const woman = withGender(profile('woman'), 'female');
    prisma.unionProfile.findUnique.mockResolvedValue(me);
    prisma.unionProfile.findMany.mockResolvedValue([man, woman]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('me');

    expect(result.items.map((item) => item.user.id)).toEqual(['woman']);
  });

  it('убирает кандидата, чей собственный выбор мне не подходит', async () => {
    const me = withGender(profile('me'), 'male');
    const seeksMen = withDetails(
      withIntentions(withGender(profile('woman'), 'female'), [
        { type: 'family', weight: 100 },
      ]),
      { familySeeksGender: 'male' },
    );
    const seeksWomen = withDetails(
      withIntentions(withGender(profile('woman2'), 'female'), [
        { type: 'family', weight: 100 },
      ]),
      { familySeeksGender: 'female' },
    );
    prisma.unionProfile.findUnique.mockResolvedValue(me);
    prisma.unionProfile.findMany.mockResolvedValue([seeksMen, seeksWomen]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('me');

    // Я мужчина: подхожу той, кто ищет мужчин, и не подхожу той, кто ищет
    // женщин, — хотя собственного ограничения у меня нет.
    expect(result.items.map((item) => item.user.id)).toEqual(['woman']);
  });

  it('складывает явный фильтр по полу с выбором в цели знакомства', async () => {
    const me = withDetails(
      withIntentions(withGender(profile('me'), 'male'), [
        { type: 'family', weight: 100 },
      ]),
      { familySeeksGender: 'female' },
    );
    const woman = withGender(profile('woman'), 'female');
    const man = withGender(profile('man'), 'male');
    prisma.unionProfile.findUnique.mockResolvedValue(me);
    prisma.unionProfile.findMany.mockResolvedValue([woman, man]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('me', { gender: 'male' });

    // Явный фильтр просит мужчин, выбор в цели — женщин: вместе не остаётся
    // никого, и это честнее, чем молча проигнорировать одно из условий.
    expect(result.items).toEqual([]);
  });

  it('фильтрует по питанию, отсекая профили без указанного значения', async () => {
    const vegan = withDetails(profile('vegan'), { diet: 'vegan' });
    const unknown = profile('unknown');
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    prisma.unionProfile.findMany.mockResolvedValue([vegan, unknown]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('me', { diet: 'vegan' });

    expect(result.items.map((item) => item.user.id)).toEqual(['vegan']);
  });

  it('фильтрует по минимальному числу регулирующих принципов', async () => {
    const strict = withDetails(profile('strict'), {
      regulativePrinciples: ['no_meat', 'no_intoxicants', 'no_gambling'],
    });
    const relaxed = withDetails(profile('relaxed'), {
      regulativePrinciples: ['no_meat'],
    });
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    prisma.unionProfile.findMany.mockResolvedValue([strict, relaxed]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('me', {
      principlesMin: 3,
    });

    expect(result.items.map((item) => item.user.id)).toEqual(['strict']);
  });

  it('применяет желаемый возраст партнёра из моей анкеты', async () => {
    const young = withBirthYear(profile('young'), 2004);
    const older = withBirthYear(profile('older'), 1990);
    prisma.unionProfile.findUnique.mockResolvedValue(
      withDetails(profile('me'), { ageRangeMin: 30, ageRangeMax: 45 }),
    );
    prisma.unionProfile.findMany.mockResolvedValue([young, older]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('me');

    expect(result.items.map((item) => item.user.id)).toEqual(['older']);
  });

  it('не отсекает анкету по её собственным пожеланиям к возрасту партнёра', async () => {
    // Раньше желаемый возраст партнёра кандидата (например, "30-40") прятал
    // его от смотрящих старше 40, даже если у смотрящего никаких ограничений
    // нет — свой диапазон должен сужать то, что видишь ты, а не то, кто
    // видит тебя.
    const picky = withDetails(withBirthYear(profile('picky'), 1990), {
      ageRangeMin: 40,
    });
    const open = withBirthYear(profile('open'), 1990);
    prisma.unionProfile.findUnique.mockResolvedValue(
      withBirthYear(profile('me'), 2000),
    );
    prisma.unionProfile.findMany.mockResolvedValue([picky, open]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('me');

    expect(result.items.map((item) => item.user.id).sort()).toEqual([
      'open',
      'picky',
    ]);
  });

  it('ranks a confirmed devotee above an equally compatible profile', async () => {
    const plain = profile('plain');
    const confirmed = withStage(profile('confirmed'), 'devotee', 'confirmed');
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    // Порядок из БД обратный ожидаемому: сортировка обязана его перестроить.
    prisma.unionProfile.findMany.mockResolvedValue([plain, confirmed]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('me');

    expect(result.items.map((item) => item.user.id)).toEqual([
      'confirmed',
      'plain',
    ]);
  });

  it('does not update isActive when the field is omitted', async () => {
    profileUpsert.mockResolvedValue(profile('me'));
    findSavedProfile.mockResolvedValue(profile('me'));

    await service.upsertProfile('me', validProfileBody);

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(profileUpsert).toHaveBeenCalledTimes(1);
    const upsertCall = profileUpsert.mock.calls[0] as unknown as [
      { update: Record<string, unknown> },
    ];
    expect(upsertCall[0].update).not.toHaveProperty('isActive');
  });

  it('does not touch «О себе» fields that were not sent', async () => {
    profileUpsert.mockResolvedValue(profile('me'));
    findSavedProfile.mockResolvedValue(profile('me'));

    await service.upsertProfile('me', validProfileBody);

    const upsertCall = profileUpsert.mock.calls[0] as unknown as [
      { update: Record<string, unknown> },
    ];
    for (const field of ['status', 'heightCm', 'diet', 'pets']) {
      expect(upsertCall[0].update).not.toHaveProperty(field);
    }
  });

  it('saves «О себе» fields that were sent', async () => {
    profileUpsert.mockResolvedValue(profile('me'));
    findSavedProfile.mockResolvedValue(profile('me'));

    await service.upsertProfile('me', {
      ...validProfileBody,
      status: '  Харе Кришна  ',
      heightCm: 180,
      diet: 'vegetarian',
      regulativePrinciples: ['no_meat', 'no_meat', 'no_gambling'],
      ageRangeMin: 30,
      ageRangeMax: 45,
    });

    const upsertCall = profileUpsert.mock.calls[0] as unknown as [
      { update: Record<string, unknown> },
    ];
    expect(upsertCall[0].update).toMatchObject({
      status: 'Харе Кришна',
      heightCm: 180,
      diet: 'vegetarian',
      regulativePrinciples: ['no_meat', 'no_gambling'],
      ageRangeMin: 30,
      ageRangeMax: 45,
    });
  });

  it('rejects an inverted desired age range', async () => {
    await expect(
      service.upsertProfile('me', {
        ...validProfileBody,
        ageRangeMin: 45,
        ageRangeMax: 30,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an out-of-range height', async () => {
    await expect(
      service.upsertProfile('me', { ...validProfileBody, heightCm: 300 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an unknown diet value', async () => {
    await expect(
      service.upsertProfile('me', {
        ...validProfileBody,
        diet: 'pizza' as never,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns completeness together with the profile', async () => {
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    prisma.userPhoto.count.mockResolvedValue(2);

    const state = await service.getState('me');

    // Заполнены только фото (12) и намерения (10) из фикстуры.
    expect(state.completeness.percent).toBe(22);
    expect(state.completeness.next).toBe('about');
  });

  it('generates a status from the filled-in profile fields', async () => {
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    prisma.user.findUnique.mockResolvedValue({ spiritualStage: 'devotee' });

    const result = await service.generateText('me', 'status');

    expect(result).toEqual({ text: 'generated text' });
    expect(generation.generatePlainText).toHaveBeenCalledTimes(1);
    const [prompt, maxLength] = generation.generatePlainText.mock.calls[0] as [
      string,
      number,
    ];
    expect(maxLength).toBe(120);
    expect(prompt).toContain('Духовный этап: devotee');
    expect(prompt).toContain('friendship (100%)');
  });

  it('generates an about text with a longer soft limit', async () => {
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    prisma.user.findUnique.mockResolvedValue({ spiritualStage: null });

    await service.generateText('me', 'about');

    const [, maxLength] = generation.generatePlainText.mock.calls[0] as [
      string,
      number,
    ];
    expect(maxLength).toBe(500);
  });

  it('generates a generic prompt when the profile has no data yet', async () => {
    prisma.unionProfile.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ spiritualStage: null });

    await service.generateText('me', 'status');

    const [prompt] = generation.generatePlainText.mock.calls[0] as [string];
    expect(prompt).toContain('Данных пока нет');
  });

  it('rejects an unsupported field to generate', async () => {
    await expect(
      service.generateText('me', 'nickname' as never),
    ).rejects.toThrow(BadRequestException);
    expect(generation.generatePlainText).not.toHaveBeenCalled();
  });

  it('allows an inactive profile card for an accepted connection', async () => {
    prisma.unionProfile.findUnique
      .mockResolvedValueOnce(profile('me'))
      .mockResolvedValueOnce(profile('other', { isActive: false }));
    prisma.unionConnectionRequest.findFirst.mockResolvedValue(connection());

    const result = await service.getRecommendationForUser('me', 'other');

    expect(result.user.id).toBe('other');
    expect(result.user.contacts).toEqual({
      socialLinks: { website: 'https://other.example.com' },
      messengers: { telegram: '@other' },
    });
  });

  it('looks up a single card only among active, non-deleting accounts', async () => {
    prisma.unionProfile.findUnique
      .mockResolvedValueOnce(profile('me'))
      // Второй findUnique — карточка цели с фильтром по аккаунту.
      .mockResolvedValueOnce(profile('other'));
    prisma.unionConnectionRequest.findFirst.mockResolvedValue(null);

    await service.getRecommendationForUser('me', 'other');

    expect(prisma.unionProfile.findUnique).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          userId: 'other',
          user: { accountStatus: 'active', pendingDeletionAt: null },
        },
      }),
    );
  });

  it('rejects an inactive profile without an accepted connection', async () => {
    prisma.unionProfile.findUnique
      .mockResolvedValueOnce(profile('me'))
      .mockResolvedValueOnce(profile('other', { isActive: false }));
    prisma.unionConnectionRequest.findFirst.mockResolvedValue(null);

    await expect(
      service.getRecommendationForUser('me', 'other'),
    ).rejects.toThrow('Профиль не найден');
  });

  it('rejects intention weights that do not total 100', async () => {
    await expect(
      service.upsertProfile('me', {
        intentions: [{ type: 'friendship', weight: 99 }],
      }),
    ).rejects.toThrow('Сумма весов намерений должна быть 100, сейчас 99');
  });

  it('rejects an invalid privacy level', async () => {
    await expect(
      service.upsertProfile('me', {
        ...validProfileBody,
        privacy: { contacts: 'invalid' },
      } as unknown as UnionProfileUpdateRequest),
    ).rejects.toThrow('Недопустимое значение приватности: contacts');
  });

  it.each([
    ['without a match', null, undefined, null],
    [
      'after an accepted match',
      connection(),
      undefined,
      {
        socialLinks: { website: 'https://other.example.com' },
        messengers: { telegram: '@other' },
      },
    ],
    ['when contacts are hidden', connection(), 'hidden', null],
  ])(
    'returns expected contacts %s',
    async (_caseName, savedConnection, contacts, expectedContacts) => {
      prisma.unionProfile.findUnique
        .mockResolvedValueOnce(profile('me'))
        .mockResolvedValueOnce(profile('other', { contacts }));
      prisma.unionConnectionRequest.findFirst.mockResolvedValue(
        savedConnection,
      );

      const result: UnionRecommendation =
        await service.getRecommendationForUser('me', 'other');

      expect(result.user.contacts).toEqual(expectedContacts);
    },
  );

  it('hides gallery photos and the avatar when photo privacy is hidden', async () => {
    prisma.unionProfile.findUnique
      .mockResolvedValueOnce(profile('me'))
      .mockResolvedValueOnce(
        profile('other', {
          photoPrivacy: 'hidden',
          avatarUrl: 'https://example.com/avatar.webp',
          photos: [photo('photo-1')],
        }),
      );
    prisma.unionConnectionRequest.findFirst.mockResolvedValue(connection());

    const result = await service.getRecommendationForUser('me', 'other');

    expect(result.user).toMatchObject({ photos: [], avatarUrl: null });
    expect(gallery.signPublicPhotos).not.toHaveBeenCalled();
  });

  it('does not sign after-match photos before a connection is accepted', async () => {
    prisma.unionProfile.findUnique
      .mockResolvedValueOnce(profile('me'))
      .mockResolvedValueOnce(
        profile('other', {
          photoPrivacy: 'after_match',
          avatarUrl: 'https://example.com/avatar.webp',
          photos: [photo('photo-1')],
        }),
      );
    prisma.unionConnectionRequest.findFirst.mockResolvedValue(
      connection('pending'),
    );

    const result = await service.getRecommendationForUser('me', 'other');

    expect(result.user).toMatchObject({ photos: [], avatarUrl: null });
    expect(gallery.signPublicPhotos).not.toHaveBeenCalled();
  });

  it('signs after-match photos after a connection is accepted', async () => {
    prisma.unionProfile.findUnique
      .mockResolvedValueOnce(profile('me'))
      .mockResolvedValueOnce(
        profile('other', {
          photoPrivacy: 'after_match',
          avatarUrl: 'https://example.com/avatar.webp',
          photos: [photo('photo-1')],
        }),
      );
    prisma.unionConnectionRequest.findFirst.mockResolvedValue(connection());

    const result = await service.getRecommendationForUser('me', 'other');

    expect(result.user.photos).toEqual([
      { id: 'photo-1', url: 'signed-1', width: 1200, height: 800 },
    ]);
    expect(result.user.avatarUrl).toBeNull();
    expect(gallery.signPublicPhotos).toHaveBeenCalledWith([photo('photo-1')]);
  });

  it('selects ordered public photo metadata and exposes it to everyone', async () => {
    const photos = [photo('photo-1', 0), photo('photo-2', 1)];
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    prisma.unionProfile.findMany.mockResolvedValue([
      profile('other', {
        photoPrivacy: 'everyone',
        avatarUrl: 'https://example.com/avatar.webp',
        photos,
      }),
    ]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('me');

    expect(prisma.unionProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          userId: { not: 'me' },
          user: { accountStatus: 'active', pendingDeletionAt: null },
        },
        include: {
          intentions: true,
          user: {
            include: {
              photos: {
                where: { isPublic: true },
                orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
                select: {
                  id: true,
                  storageKey: true,
                  width: true,
                  height: true,
                },
              },
            },
          },
        },
      }),
    );
    expect(result.items[0]?.user.photos).toEqual([
      { id: 'photo-1', url: 'signed-1', width: 1200, height: 800 },
      { id: 'photo-2', url: 'signed-2', width: 800, height: 1200 },
    ]);
    expect(result.items[0]?.user.avatarUrl).toBeNull();
    expect(gallery.signPublicPhotos).toHaveBeenCalledWith(photos);
  });

  it('preserves the visible avatar fallback when no public photos exist', async () => {
    prisma.unionProfile.findUnique
      .mockResolvedValueOnce(profile('me'))
      .mockResolvedValueOnce(
        profile('other', {
          photoPrivacy: 'everyone',
          avatarUrl: 'https://example.com/avatar.webp',
        }),
      );
    prisma.unionConnectionRequest.findFirst.mockResolvedValue(null);

    const result = await service.getRecommendationForUser('me', 'other');

    expect(result.user).toMatchObject({
      photos: [],
      avatarUrl: 'https://example.com/avatar.webp',
    });
    expect(gallery.signPublicPhotos).not.toHaveBeenCalled();
  });

  it('returns an empty gallery and null avatar when no image exists', async () => {
    prisma.unionProfile.findUnique
      .mockResolvedValueOnce(profile('me'))
      .mockResolvedValueOnce(
        profile('other', { photoPrivacy: 'everyone', photos: [] }),
      );
    prisma.unionConnectionRequest.findFirst.mockResolvedValue(null);

    const result = await service.getRecommendationForUser('me', 'other');

    expect(result.user).toMatchObject({ photos: [], avatarUrl: null });
    expect(gallery.signPublicPhotos).not.toHaveBeenCalled();
  });

  it('signs photos only for final paginated recommendations', async () => {
    const firstPhotos = [photo('first-photo')];
    const secondPhotos = [photo('second-photo')];
    const thirdPhotos = [photo('third-photo')];
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    prisma.unionProfile.findMany.mockResolvedValue([
      profile('first', { photos: firstPhotos }),
      profile('second', { photos: secondPhotos }),
      profile('third', { photos: thirdPhotos }),
    ]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('me', {
      page: 2,
      pageSize: 1,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.user.id).toBe('second');
    expect(gallery.signPublicPhotos).toHaveBeenCalledTimes(1);
    expect(gallery.signPublicPhotos).toHaveBeenCalledWith(secondPhotos);
  });

  it('counts profiles per goal ignoring the goal filter but honouring the others', async () => {
    prisma.unionProfile.findUnique.mockResolvedValue(
      withGender(profile('me'), 'male'),
    );
    // Пол проставлен явно: анкета с семьёй от 50% видна только
    // противоположному полу, иначе её отсеял бы совсем другой фильтр.
    prisma.unionProfile.findMany.mockResolvedValue([
      withIntentions(withGender(profile('a'), 'female'), [
        { type: 'family', weight: 50 },
        { type: 'service', weight: 50 },
      ]),
      withIntentions(withGender(profile('b'), 'female'), [
        { type: 'family', weight: 100 },
      ]),
      withIntentions(withGender(profile('c'), 'female'), [
        { type: 'business', weight: 100 },
      ]),
    ]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('me', {
      intentions: ['business'],
    });

    expect(result.items.map((item) => item.user.id)).toEqual(['c']);
    // Счётчики не зависят от выбранной цели: они отвечают на вопрос
    // «сколько будет, если нажать вот сюда».
    expect(result.intentionCounts).toEqual({
      all: 3,
      family: 2,
      business: 1,
      friendship: 0,
      service: 1,
    });
  });

  it('drops profiles excluded by another filter from the goal counts', async () => {
    prisma.unionProfile.findUnique.mockResolvedValue(
      withGender(profile('me'), 'male'),
    );
    prisma.unionProfile.findMany.mockResolvedValue([
      withIntentions(withGender(profile('near'), 'female'), [
        { type: 'family', weight: 100 },
      ]),
      withIntentions(
        withGender(
          profile('far', {
            homeLocation: { ...defaultLocation, city: 'Казань' },
          }),
          'female',
        ),
        [{ type: 'family', weight: 100 }],
      ),
    ]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('me', { city: 'Москва' });

    expect(result.intentionCounts.all).toBe(1);
    expect(result.intentionCounts.family).toBe(1);
  });

  it('treats several goals as OR', async () => {
    prisma.unionProfile.findUnique.mockResolvedValue(
      withGender(profile('me'), 'male'),
    );
    prisma.unionProfile.findMany.mockResolvedValue([
      withIntentions(withGender(profile('a'), 'female'), [
        { type: 'family', weight: 100 },
      ]),
      withIntentions(withGender(profile('b'), 'female'), [
        { type: 'business', weight: 100 },
      ]),
      withIntentions(withGender(profile('c'), 'female'), [
        { type: 'service', weight: 100 },
      ]),
    ]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('me', {
      intentions: ['family', 'service'],
    });

    expect(result.items.map((item) => item.user.id).sort()).toEqual(['a', 'c']);
  });

  it('still filters by the legacy single intention parameter', async () => {
    prisma.unionProfile.findUnique.mockResolvedValue(
      withGender(profile('me'), 'male'),
    );
    prisma.unionProfile.findMany.mockResolvedValue([
      withIntentions(withGender(profile('a'), 'female'), [
        { type: 'family', weight: 100 },
      ]),
      withIntentions(withGender(profile('b'), 'female'), [
        { type: 'business', weight: 100 },
      ]),
    ]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('me', {
      intention: 'business',
    });

    expect(result.items.map((item) => item.user.id)).toEqual(['b']);
  });

  it('ignores an unknown goal instead of emptying the deck', async () => {
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    prisma.unionProfile.findMany.mockResolvedValue([profile('a')]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('me', {
      intentions: ['nonsense'] as never,
    });

    expect(result.items.map((item) => item.user.id)).toEqual(['a']);
  });
});

describe('birthDateBoundsForAge', () => {
  const now = new Date('2026-08-19T12:00:00Z');

  it('turns an age range into birthDate bounds with a safety margin', () => {
    const bounds = birthDateBoundsForAge(30, 40, now);
    // Возраст >= 30: родился не позже 1996-08-19 (+2 дня запаса).
    expect(bounds.lte?.toISOString().slice(0, 10)).toBe('1996-08-21');
    // Возраст <= 40: 41-й день рождения ещё не наступил, то есть родился
    // после 1985-08-19 (-2 дня запаса).
    expect(bounds.gte?.toISOString().slice(0, 10)).toBe('1985-08-17');
  });

  it('leaves an open side unbounded', () => {
    expect(birthDateBoundsForAge(null, 25, now).lte).toBeUndefined();
    expect(birthDateBoundsForAge(25, null, now).gte).toBeUndefined();
  });
});

describe('buildRecommendationCandidateWhere', () => {
  const now = new Date('2026-08-19T12:00:00Z');
  const base = {
    userId: 'me',
    excludedUserIds: [],
    filters: {},
    myAge: { ageRangeMin: null, ageRangeMax: null },
    now,
  };

  it('keeps the minimal shape when nothing is filtered', () => {
    expect(buildRecommendationCandidateWhere(base)).toEqual({
      isActive: true,
      userId: { not: 'me' },
      user: { accountStatus: 'active', pendingDeletionAt: null },
    });
  });

  it('dedupes exclusions and never lists the viewer', () => {
    const where = buildRecommendationCandidateWhere({
      ...base,
      excludedUserIds: ['a', 'a', 'me', 'b'],
    });
    expect(where.userId).toEqual({ not: 'me', notIn: ['a', 'b'] });
  });

  it('requires a birth date for an explicit age filter', () => {
    const where = buildRecommendationCandidateWhere({
      ...base,
      filters: { ageMin: 30, ageMax: 40 },
    });
    expect(where.AND).toEqual([
      {
        user: {
          birthDate: {
            not: null,
            lte: new Date('1996-08-21T00:00:00Z'),
            gte: new Date('1985-08-17T00:00:00Z'),
          },
        },
      },
    ]);
  });

  it('lets unknown age through my own preferred range', () => {
    const where = buildRecommendationCandidateWhere({
      ...base,
      myAge: { ageRangeMin: 25, ageRangeMax: null },
    });
    expect(where.AND).toEqual([
      {
        OR: [
          { user: { birthDate: null } },
          { user: { birthDate: { lte: new Date('2001-08-21T00:00:00Z') } } },
        ],
      },
    ]);
  });

  it('does not filter candidates by their own preferred partner age', () => {
    // Раньше анкета с "желаемым возрастом партнёра" 30-40 не показывалась
    // 41-летнему смотрящему, даже если у него самого нет ограничений. Это
    // удивляло людей: свой диапазон должен сужать то, что видишь ты сам,
    // а не то, кто видит тебя.
    const where = buildRecommendationCandidateWhere({
      ...base,
      myAge: { ageRangeMin: null, ageRangeMax: null },
    });
    expect(where.AND).toBeUndefined();
  });
});
