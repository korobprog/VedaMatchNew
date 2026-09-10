import type {
  WellnessIngredientClass,
  WellnessVerdict,
} from "@vedamatch/shared";

/**
 * Подписи вердикта и классов ограничений.
 *
 * Вынесено отдельным модулем и покрыто тестом: вердикт нельзя кодировать одним
 * цветом — человек с дальтонизмом прочитает «можно» там, где написано
 * «нельзя». Поэтому у каждого исхода есть слово и значок, а не только оттенок.
 */

export interface VerdictLook {
  /** Короткое слово в бейдже. */
  label: string;
  /** Одна фраза о том, что это значит. */
  hint: string;
  /** Значок: смысл читается и без цвета. */
  glyph: string;
  /** Имя акцентного токена, а не `#RRGGBB`: иначе цвет переживёт смену темы. */
  accent: "magenta" | "cyan" | "gold" | "text-1";
}

const LOOKS: Record<WellnessVerdict, VerdictLook> = {
  clean: {
    label: "Подходит",
    hint: "В составе нет того, что вы исключили.",
    glyph: "✓",
    accent: "cyan",
  },
  warning: {
    label: "Осторожно",
    hint: "Запретное может быть в составе, но прямо это не сказано.",
    glyph: "!",
    accent: "gold",
  },
  forbidden: {
    label: "Не подходит",
    hint: "В составе прямо названо то, что вы исключили.",
    glyph: "✕",
    accent: "magenta",
  },
  unknown: {
    label: "Неизвестно",
    hint: "Состав разобран не до конца — судить о нём мы не беремся.",
    glyph: "?",
    accent: "text-1",
  },
};

export function verdictLook(verdict: WellnessVerdict): VerdictLook {
  return LOOKS[verdict];
}

const CLASS_LABELS: Record<WellnessIngredientClass, string> = {
  meat: "Мясо",
  fish: "Рыба и морепродукты",
  egg: "Яйцо",
  dairy: "Молочное",
  honey: "Мёд и продукты пчеловодства",
  gelatin: "Желатин",
  rennet: "Сычужный фермент",
  onion: "Лук",
  garlic: "Чеснок",
  mushroom: "Грибы",
  alcohol: "Алкоголь",
  caffeine: "Кофеин",
  additive: "Спорные добавки",
  other: "Прочее",
};

export function ingredientClassLabel(value: WellnessIngredientClass): string {
  return CLASS_LABELS[value];
}

/**
 * Строка «почему так». Собирается здесь, а не в разметке: её же показывает
 * история сканов, и расходиться две формулировки не должны.
 *
 * `unclearCount` считает и незнакомые слова, и формулировки, которые ничего не
 * говорят. Звать вторые «неразобранными» нельзя — они как раз разобраны, это
 * они молчат.
 */
export function reasonSummary(
  reasons: { ingredient: { name: string } }[],
  unclearCount: number,
): string {
  const named = reasons.map((reason) => reason.ingredient.name);
  if (named.length && unclearCount) {
    return `${named.join(", ")}; ещё ${unclearCount} позиций состава без ясного ответа`;
  }
  if (named.length) return named.join(", ");
  if (unclearCount) {
    return `${unclearCount} позиций состава без ясного ответа`;
  }
  return "Состав разобран полностью";
}

/**
 * Было ли что судить. Скан по штрихкоду, не нашедший продукт, состава не
 * видел вовсе — показывать для него вердикт значит утверждать «неизвестно» и
 * тут же подписывать «состав разобран полностью».
 */
export function hasSomethingToJudge(result: {
  product: unknown | null;
  ingredientsRaw?: string | null;
  result: { reasons: unknown[]; hidden?: unknown[]; unrecognized: unknown[] };
}): boolean {
  if (result.product) return true;
  if (result.ingredientsRaw) return true;
  return (
    result.result.reasons.length > 0 ||
    (result.result.hidden?.length ?? 0) > 0 ||
    result.result.unrecognized.length > 0
  );
}
