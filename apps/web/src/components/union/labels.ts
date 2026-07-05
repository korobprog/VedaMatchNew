import type { UnionIntentionType } from "@vedamatch/shared";

export const intentionLabels: Record<UnionIntentionType, string> = {
  family: "Создание семьи",
  business: "Бизнес и проекты",
  friendship: "Дружба по интересам",
  service: "Совместное служение",
};

export const intentionTypes = Object.keys(intentionLabels) as UnionIntentionType[];
