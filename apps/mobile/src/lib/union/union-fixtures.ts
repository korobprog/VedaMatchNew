import type {
  UnionConnectionRequestDto,
  UnionRecommendation,
  UnionUserSummary,
} from '@vedamatch/shared';

/**
 * Заготовки данных Знакомств для тестов — как `blog-fixtures.ts`. Экранами
 * не импортируется, поэтому в бандл не попадает.
 */

export function unionUser(overrides: Partial<UnionUserSummary> = {}): UnionUserSummary {
  return {
    id: 'u1',
    name: 'Радха',
    avatarUrl: null,
    photos: [],
    city: 'Москва',
    country: 'Россия',
    spiritualStage: 'devotee',
    age: 27,
    activity: 'today',
    lastSeenAt: null,
    isVerifiedDevotee: false,
    isPhotoVerified: false,
    contacts: null,
    ...overrides,
  };
}

export function unionRecommendation(
  userOverrides: Partial<UnionUserSummary> = {},
  overrides: Partial<UnionRecommendation> = {},
): UnionRecommendation {
  return {
    user: unionUser(userOverrides),
    profile: {
      about: null,
      format: 'any',
      relocationReady: false,
      languages: [],
      skills: [],
      interests: [],
      values: [],
      intentions: [],
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
    },
    compatibility: { total: 72, breakdown: [] },
    connection: null,
    myDecision: null,
    ...overrides,
  };
}

export function unionRequest(
  options: Partial<Omit<UnionConnectionRequestDto, 'user'>> & { userId?: string } = {},
): UnionConnectionRequestDto {
  const { userId = options.id ?? 'u1', ...rest } = options;
  return {
    id: 'r1',
    status: 'pending',
    direction: 'incoming',
    isSuperlike: false,
    message: null,
    createdAt: '2026-09-20T10:00:00Z',
    respondedAt: null,
    user: unionUser({ id: userId }),
    ...rest,
  };
}
