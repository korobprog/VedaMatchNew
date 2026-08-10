import type {
  AstroBirthFieldKey,
  AstroCompleteness,
  AstroFeatureKey,
  AstroFeatureState,
} from '@vedamatch/shared';

/**
 * Прогресс заполнения данных рождения и то, что он открывает.
 *
 * Веса намеренно неравные и отражают не важность поля, а его трение. Дата уже есть
 * в портальном профиле, поэтому человек приходит не на пустой экран, а на заполненный
 * на четверть. Время — единственное поле, которое нельзя заполнить «прямо сейчас»
 * (нужно свидетельство о рождении или звонок родителям), поэтому за него дана
 * половина шкалы: усилие и награда должны совпадать.
 */
const FIELD_WEIGHTS: Array<[AstroBirthFieldKey, number]> = [
  ['birthDate', 25],
  ['birthPlace', 25],
  ['birthTime', 50],
];

export const ASTRO_COMPLETENESS_TOTAL = FIELD_WEIGHTS.reduce(
  (sum, [, weight]) => sum + weight,
  0,
);

/**
 * Что нужно каждой возможности. Список — не маркетинг, а физика расчёта:
 *
 * - знаки грах: медленные планеты за сутки знак не меняют, хватает одной даты;
 * - накшатра Луны и даши: Луна проходит накшатру примерно за сутки, так что без
 *   времени они неопределимы — даши считаются как раз от положения Луны;
 * - лагна и дома: вращение Земли, то есть время и место обязательны;
 * - день по транзитам: транзитные планеты кладутся на дома натальной карты.
 */
const FEATURE_REQUIREMENTS: Array<[AstroFeatureKey, AstroBirthFieldKey[]]> = [
  ['graha_signs', ['birthDate']],
  ['moon_nakshatra', ['birthDate', 'birthTime']],
  ['dasha', ['birthDate', 'birthTime']],
  ['lagna', ['birthDate', 'birthTime', 'birthPlace']],
  ['houses', ['birthDate', 'birthTime', 'birthPlace']],
  ['daily_transits', ['birthDate', 'birthTime', 'birthPlace']],
];

export interface AstroCompletenessInput {
  hasBirthDate: boolean;
  hasBirthPlace: boolean;
  /** Приблизительное время считается заполненным; неизвестное — нет. */
  hasBirthTime: boolean;
}

export function computeAstroCompleteness(
  input: AstroCompletenessInput,
): AstroCompleteness {
  const filledByKey: Record<AstroBirthFieldKey, boolean> = {
    birthDate: input.hasBirthDate,
    birthPlace: input.hasBirthPlace,
    birthTime: input.hasBirthTime,
  };

  const items = FIELD_WEIGHTS.map(([key, weight]) => ({
    key,
    weight,
    filled: filledByKey[key],
  }));

  const earned = items.reduce(
    (sum, item) => (item.filled ? sum + item.weight : sum),
    0,
  );
  const missing = items.filter((item) => !item.filled).map((item) => item.key);

  const features: AstroFeatureState[] = FEATURE_REQUIREMENTS.map(
    ([key, required]) => {
      const unmet = required.filter((field) => !filledByKey[field]);
      return { key, unlocked: unmet.length === 0, requires: unmet };
    },
  );

  return {
    percent: Math.round((earned / ASTRO_COMPLETENESS_TOTAL) * 100),
    items,
    missing,
    // Порядок FIELD_WEIGHTS задаёт и приоритет подсказки: сначала дешёвые поля,
    // просьба искать свидетельство о рождении идёт последней.
    next: missing[0] ?? null,
    features,
  };
}
