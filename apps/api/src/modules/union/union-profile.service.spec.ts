import type {
  UnionPhoto,
  UnionProfileUpdateRequest,
  UnionRecommendation,
} from '@vedamatch/shared';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserGalleryService } from '../users/user-gallery.service';
import { ModerationService } from '../moderation/moderation.service';
import { MotivationGenerationService } from '../motivation/motivation-generation.service';
import { UnionMatchingService } from './union-matching.service';
import { UnionProfileService } from './union-profile.service';

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
  } = {},
) {
  return {
    id,
    email: `${id}@example.com`,
    name: id,
    avatarUrl: options.avatarUrl ?? null,
    avatarKey: null,
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
    about: null,
    relocationReady: false,
    format: 'any',
    languages: [],
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
      findMany: jest.fn(() => Promise.resolve([] as { toUserId: string }[])),
    },
    unionBoost: {
      findMany: jest.fn(() => Promise.resolve([] as { userId: string }[])),
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
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.userPhoto.count.mockResolvedValue(0);
    prisma.user.findUnique.mockResolvedValue(user('me'));
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
        where: { isActive: true, userId: { not: 'me' } },
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

  it('уважает возрастные пожелания кандидата, когда мой возраст известен', async () => {
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

    expect(result.items.map((item) => item.user.id)).toEqual(['open']);
  });

  it('не отсекает по чужим пожеланиям, если свой возраст не указан', async () => {
    const picky = withDetails(profile('picky'), { ageRangeMin: 40 });
    prisma.unionProfile.findUnique.mockResolvedValue(profile('me'));
    prisma.unionProfile.findMany.mockResolvedValue([picky]);
    prisma.unionConnectionRequest.findMany.mockResolvedValue([]);

    const result = await service.getRecommendations('me');

    expect(result.items.map((item) => item.user.id)).toEqual(['picky']);
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

    expect(prisma.unionProfile.findMany).toHaveBeenCalledWith({
      where: { isActive: true, userId: { not: 'me' } },
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
    });
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
});
