import type {
  UnionProfileCompleteness,
  UnionProfileCompletenessItem,
  UnionProfileDto,
  UnionProfileFieldKey,
} from '@vedamatch/shared';

/**
 * Веса полей анкеты. Сумма ровно 100, порядок задаёт приоритет подсказок:
 * чем выше поле в списке, тем раньше мы предложим его заполнить.
 */
const FIELD_WEIGHTS: Array<[UnionProfileFieldKey, number]> = [
  ['photos', 12],
  ['about', 12],
  ['intentions', 10],
  ['interests', 8],
  ['values', 7],
  ['status', 5],
  ['languages', 5],
  ['familyStatus', 5],
  ['childrenStatus', 5],
  ['diet', 5],
  ['regulativePrinciples', 5],
  ['ageRange', 4],
  ['skills', 4],
  ['heightCm', 3],
  ['education', 3],
  ['spiritualEducation', 3],
  ['housing', 2],
  ['pets', 1],
  ['income', 1],
];

export const UNION_COMPLETENESS_TOTAL = FIELD_WEIGHTS.reduce(
  (sum, [, weight]) => sum + weight,
  0,
);

/** Данные вне UnionProfile, которые тоже влияют на прогресс. */
export interface UnionCompletenessContext {
  /** Сколько публичных фото у пользователя */
  publicPhotoCount: number;
}

function isFilled(
  key: UnionProfileFieldKey,
  profile: UnionProfileDto,
  context: UnionCompletenessContext,
): boolean {
  switch (key) {
    case 'photos':
      return context.publicPhotoCount > 0;
    case 'about':
      return Boolean(profile.about?.trim());
    case 'status':
      return Boolean(profile.status?.trim());
    case 'familyStatus':
      return Boolean(profile.familyStatus?.trim());
    case 'intentions':
      return profile.intentions.length > 0;
    case 'languages':
      return profile.languages.length > 0;
    case 'interests':
      return profile.interests.length > 0;
    case 'values':
      return profile.values.length > 0;
    case 'skills':
      return profile.skills.length > 0;
    case 'regulativePrinciples':
      return profile.regulativePrinciples.length > 0;
    case 'pets':
      return profile.pets.length > 0;
    // Диапазон считается заполненным, когда указана хотя бы одна граница.
    case 'ageRange':
      return profile.ageRangeMin != null || profile.ageRangeMax != null;
    case 'heightCm':
      return profile.heightCm != null;
    case 'childrenStatus':
      return profile.childrenStatus != null;
    case 'diet':
      return profile.diet != null;
    case 'education':
      return profile.education != null;
    case 'spiritualEducation':
      return profile.spiritualEducation != null;
    case 'housing':
      return profile.housing != null;
    case 'income':
      return profile.income != null;
  }
}

/**
 * Прогресс заполнения анкеты. Без профиля — 0% и все поля в списке незаполненных,
 * чтобы онбординг мог показать тот же экран, что и обычное редактирование.
 */
export function computeCompleteness(
  profile: UnionProfileDto | null,
  context: UnionCompletenessContext,
): UnionProfileCompleteness {
  const items: UnionProfileCompletenessItem[] = FIELD_WEIGHTS.map(
    ([key, weight]) => ({
      key,
      weight,
      filled: profile ? isFilled(key, profile, context) : false,
    }),
  );
  const earned = items.reduce(
    (sum, item) => (item.filled ? sum + item.weight : sum),
    0,
  );
  const missing = items.filter((item) => !item.filled).map((item) => item.key);

  return {
    percent: Math.round((earned / UNION_COMPLETENESS_TOTAL) * 100),
    items,
    missing,
    next: missing[0] ?? null,
  };
}
