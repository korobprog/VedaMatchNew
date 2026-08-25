import type {
  UnionCompatibilityCriterion,
  UnionIntentionType,
} from "@vedamatch/shared";

export const intentionLabels: Record<UnionIntentionType, string> = {
  family: "Создание семьи",
  business: "Бизнес и проекты",
  friendship: "Дружба по интересам",
  service: "Совместное служение",
};

/** Из чего складывается процент совместимости — подписи для разбора. */
export const criterionLabels: Record<UnionCompatibilityCriterion, string> = {
  intentions: "Цели знакомства",
  stage: "Духовный этап",
  lifestyle: "Образ жизни",
  interests: "Интересы",
  values: "Ценности",
  location: "Локация",
  format: "Формат общения",
};

export const intentionTypes = Object.keys(intentionLabels) as UnionIntentionType[];

/** Совпадает с MIN_PROFILE_AGE на бэкенде — семью можно искать только совершеннолетним. */
export const MIN_FAMILY_AGE = 18;

/** Возраст неизвестен (дата рождения не заполнена) или меньше 18 — цель «Создание семьи» скрыта от выбора. */
export function canChooseFamily(age: number | null): boolean {
  return age !== null && age >= MIN_FAMILY_AGE;
}

/** Склонение «лет / года / год» для подписи возраста в карточках. */
export function yearsSuffix(age: number): string {
  const lastTwo = age % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return "лет";
  switch (age % 10) {
    case 1:
      return "год";
    case 2:
    case 3:
    case 4:
      return "года";
    default:
      return "лет";
  }
}
