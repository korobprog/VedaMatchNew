import type {
  AstroBirthFieldKey,
  AstroCompleteness,
  AstroFeatureKey,
} from "@vedamatch/shared";

/**
 * Тексты онбординга вынесены из разметки: их правят чаще, чем вёрстку, и по ним
 * есть тесты. Формулировки говорят, что человек получит, а не что он обязан ввести.
 */

export const FIELD_LABELS: Record<AstroBirthFieldKey, string> = {
  birthDate: "Дата рождения",
  birthPlace: "Место рождения",
  birthTime: "Время рождения",
};

export const FEATURE_LABELS: Record<AstroFeatureKey, string> = {
  graha_signs: "Положение планет по знакам",
  moon_nakshatra: "Накшатра Луны",
  dasha: "Периоды даш",
  lagna: "Лагна — восходящий знак",
  houses: "Двенадцать бхав",
  daily_transits: "Персональный день",
};

/** Почему поле вообще нужно. Объяснение снимает ощущение произвольной анкеты. */
export const FIELD_REASONS: Record<AstroBirthFieldKey, string> = {
  birthDate: "По ней видно, в каких знаках стояли планеты.",
  birthTime:
    "Земля делает оборот за сутки, поэтому без времени нельзя определить восходящий знак и дома.",
  birthPlace:
    "Восходящий знак зависит от того, в какой точке Земли вы находились.",
};

/**
 * Что откроется, если заполнить это поле. Обещание конкретное и проверяемое:
 * ровно те разделы, которые ждут именно его.
 */
export function featuresUnlockedBy(
  completeness: AstroCompleteness,
  field: AstroBirthFieldKey,
): AstroFeatureKey[] {
  return completeness.features
    .filter(
      (feature) =>
        !feature.unlocked &&
        feature.requires.length === 1 &&
        feature.requires[0] === field,
    )
    .map((feature) => feature.key);
}

/** Подсказка о следующем шаге. null — заполнять больше нечего. */
export function nextStepHint(completeness: AstroCompleteness): {
  field: AstroBirthFieldKey;
  reason: string;
  unlocks: AstroFeatureKey[];
} | null {
  const field = completeness.next;
  if (!field) return null;
  return {
    field,
    reason: FIELD_REASONS[field],
    unlocks: featuresUnlockedBy(completeness, field),
  };
}

/**
 * Где искать время рождения. Настоящий барьер — не мотивация, а то, что человек
 * физически не знает своего времени; список превращает «не знаю» в «схожу проверю».
 */
export const BIRTH_TIME_SOURCES = [
  "Свидетельство о рождении — в части советских и российских бланков время указано.",
  "Выписка из роддома или обменная карта, если они сохранились дома.",
  "Спросить маму или тех, кто был рядом: час обычно помнят, и этого уже достаточно.",
  "Запрос в архив ЗАГС по месту рождения — там хранится первичная запись акта.",
  "Домашние записи: детские альбомы, дневники, поздравительные телеграммы.",
] as const;
