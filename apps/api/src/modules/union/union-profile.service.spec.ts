import type {
  UnionProfileUpdateRequest,
  UnionRecommendation,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { UnionMatchingService } from './union-matching.service';
import { UnionProfileService } from './union-profile.service';

const createdAt = new Date('2026-07-10T10:00:00.000Z');

const defaultLocation = {
  city: 'Москва',
  country: 'Россия',
  lat: 55.7558,
  lon: 37.6176,
};

function user(id: string, homeLocation: unknown = defaultLocation) {
  return {
    id,
    email: `${id}@example.com`,
    name: id,
    avatarUrl: null,
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
  };
}

function profile(
  userId: string,
  options: {
    isActive?: boolean;
    contacts?: string;
    homeLocation?: unknown;
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
    privacy: options.contacts ? { contacts: options.contacts } : null,
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
    ),
  };
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
    unionConnectionRequest: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) =>
      callback(transaction),
    ),
  };
  const matching = {
    computeCompatibility: jest.fn(() => ({ total: 50, breakdown: [] })),
  };
  const service = new UnionProfileService(
    prisma as unknown as PrismaService,
    matching as unknown as UnionMatchingService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue(user('me'));
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
});
