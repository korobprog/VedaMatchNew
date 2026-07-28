import type { UnionIntentionType } from "@vedamatch/shared";

export const intentionLabels: Record<UnionIntentionType, string> = {
  family: "Создание семьи",
  business: "Бизнес и проекты",
  friendship: "Дружба по интересам",
  service: "Совместное служение",
};

export const intentionTypes = Object.keys(intentionLabels) as UnionIntentionType[];

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
