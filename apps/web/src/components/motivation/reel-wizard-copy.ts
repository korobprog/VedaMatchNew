import type {
  MotivationReelQuotaDto,
  MotivationReelStage,
  MotivationVisualStyle,
} from "@vedamatch/shared";

/** Подписи стилей для человека; порядок — как в `MotivationVisualStyle`. */
export const STYLE_LABELS: Record<MotivationVisualStyle, string> = {
  spiritual_watercolor: "Духовная акварель",
  cinematic_nature: "Кинематографичная природа",
  indian_miniature: "Индийская миниатюра",
  sacred_architecture: "Священная архитектура",
  minimal_symbolism: "Минимализм и символ",
  warm_documentary: "Тёплая документалистика",
  cosmic_contemplation: "Космическое созерцание",
  historical_editorial: "Историческая гравюра",
  cinematic_film: "Кадр из фильма",
  epic_wide: "Эпический план",
  night_devotional: "Ночная молитва",
  painterly_realism: "Живописный реализм",
};

export const STYLE_OPTIONS = Object.entries(STYLE_LABELS) as [MotivationVisualStyle, string][];

export type StageState = "done" | "active" | "pending" | "failed";

export interface StageItem {
  key: "quote" | "review" | "image" | "ready";
  title: string;
  hint: string;
  state: StageState;
}

/**
 * Пять шагов мастера сведены к четырём стадиям конвейера: цитата и стиль
 * человек заполняет сам, дальше — проверка, картинка, готово.
 */
export function stageItems(stage: MotivationReelStage): StageItem[] {
  const states: Record<MotivationReelStage, StageState[]> = {
    ai_review: ["done", "active", "pending", "pending"],
    admin_review: ["done", "active", "pending", "pending"],
    rejected: ["done", "failed", "pending", "pending"],
    generating: ["done", "done", "active", "pending"],
    image_review: ["done", "done", "done", "active"],
    failed: ["done", "done", "failed", "pending"],
    published: ["done", "done", "done", "done"],
  };
  const hints: Record<MotivationReelStage, [string, string, string, string]> = {
    ai_review: ["Принята", "ИИ-модератор читает текст — обычно до минуты", "Ждёт проверки", "Публикация в ленту"],
    admin_review: ["Принята", "Ждёт администратора — мы пришлём уведомление", "После одобрения", "Публикация в ленту"],
    rejected: ["Принята", "Не пройдена — причина ниже", "—", "—"],
    generating: ["Принята", "Пройдена", "Рисуем иллюстрацию, ~1–2 минуты", "Публикация в ленту"],
    image_review: ["Принята", "Пройдена", "Готова", "Администратор смотрит кадр перед публикацией"],
    failed: ["Принята", "Пройдена", "Не удалось нарисовать — попробуем снова позже", "—"],
    published: ["Принята", "Пройдена", "Готова", "Опубликован"],
  };
  const titles = ["Цитата", "Проверка", "Картинка", "Готово"] as const;
  const keys = ["quote", "review", "image", "ready"] as const;
  return keys.map((key, index) => ({
    key,
    title: titles[index],
    hint: hints[stage][index],
    state: states[stage][index],
  }));
}

/** Пока конвейер работает, мастер опрашивает статус; в конечных состояниях — нет. */
export function shouldPoll(stage: MotivationReelStage): boolean {
  return stage === "ai_review" || stage === "generating";
}

export const POLL_INTERVAL_MS = 3000;

export function quotaLine(quota: MotivationReelQuotaDto | null): string {
  if (!quota) return "";
  if (!quota.enabled) return "Создание своих рилсов сейчас выключено";
  if (quota.unlimited) return "Без лимита · администратор";
  if (quota.limit === 0) return "Создание своих рилсов сейчас недоступно";
  return `Сегодня: ${Math.min(quota.used, quota.limit)} из ${quota.limit}`;
}

export function quotaExhausted(quota: MotivationReelQuotaDto | null): boolean {
  if (!quota) return false;
  if (quota.unlimited) return false;
  return !quota.enabled || quota.remaining <= 0;
}

export const MAX_TEXT = 600;
export const MIN_TEXT = 12;
