import type { UnionProfileDto } from '@vedamatch/shared';
import {
  computeCompleteness,
  UNION_COMPLETENESS_TOTAL,
} from './union-completeness';

function profile(overrides: Partial<UnionProfileDto> = {}): UnionProfileDto {
  return {
    id: 'profile-1',
    userId: 'user-1',
    about: null,
    status: null,
    relocationReady: false,
    format: 'any',
    languages: [],
    skills: [],
    interests: [],
    values: [],
    familyStatus: null,
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
    privacy: null,
    isActive: true,
    showcaseOptIn: false,
    showcaseBlocked: false,
    requestsFromVerifiedOnly: false,
    contactMode: 'requests',
    familySeeksGender: null,
    intentions: [],
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Анкета, в которой заполнено всё, что считается в прогрессе. Животных и
 * желаемого возраста здесь нет намеренно: они необязательные, и 100% должны
 * достигаться без них.
 */
function full(): UnionProfileDto {
  return profile({
    about: 'текст',
    status: 'Харе Кришна',
    intentions: [{ type: 'family', weight: 100 }],
    languages: ['русский'],
    interests: ['киртан'],
    values: ['семья'],
    skills: ['кулинария'],
    familyStatus: 'свободен / свободна',
    childrenStatus: 'none_want',
    diet: 'vegetarian',
    regulativePrinciples: ['no_meat'],
    heightCm: 180,
    education: 'higher',
    spiritualEducation: 'bhakti_shastri',
    housing: 'own_place',
    income: 'basic_and_rest',
  });
}

describe('computeCompleteness', () => {
  it('веса полей в сумме дают 100', () => {
    expect(UNION_COMPLETENESS_TOTAL).toBe(100);
  });

  it('без профиля даёт 0% и все поля в незаполненных', () => {
    const result = computeCompleteness(null, { publicPhotoCount: 0 });
    expect(result.percent).toBe(0);
    expect(result.missing).toHaveLength(result.items.length);
    expect(result.next).toBe('photos');
  });

  it('пустой профиль без фото даёт 0%', () => {
    const result = computeCompleteness(profile(), { publicPhotoCount: 0 });
    expect(result.percent).toBe(0);
  });

  it('заполненные поля складываются в процент', () => {
    const result = computeCompleteness(
      profile({
        about: 'Немного о себе',
        intentions: [{ type: 'family', weight: 100 }],
      }),
      { publicPhotoCount: 2 },
    );
    // photos 14 + about 14 + intentions 11
    expect(result.percent).toBe(39);
    expect(result.missing).not.toContain('about');
  });

  it('пробелы в тексте не считаются заполненным полем', () => {
    const result = computeCompleteness(profile({ about: '   ', status: ' ' }), {
      publicPhotoCount: 0,
    });
    expect(result.percent).toBe(0);
    expect(result.missing).toContain('about');
    expect(result.missing).toContain('status');
  });

  it('необязательные поля не держат прогресс', () => {
    // Животные и желаемый возраст в анкете есть, а в прогрессе их нет: не
    // заполнив их, человек всё равно доходит до 100%.
    const result = computeCompleteness(full(), { publicPhotoCount: 1 });
    expect(result.percent).toBe(100);
    expect(result.items.map((item) => item.key)).not.toContain('pets');
    expect(result.items.map((item) => item.key)).not.toContain('ageRange');
  });

  it('подсказывает самое весомое из незаполненных полей', () => {
    const result = computeCompleteness(
      profile({
        about: 'текст',
        intentions: [{ type: 'family', weight: 100 }],
      }),
      { publicPhotoCount: 1 },
    );
    expect(result.next).toBe('interests');
  });

  it('полностью заполненный профиль даёт 100%', () => {
    const result = computeCompleteness(full(), { publicPhotoCount: 1 });
    expect(result.percent).toBe(100);
    expect(result.missing).toEqual([]);
    expect(result.next).toBeNull();
  });
});
