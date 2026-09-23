import type {
  WellnessCheckReason,
  WellnessCheckSourceLevel,
  WellnessCheckStatus,
} from "@vedamatch/shared";

/**
 * Подписи автопроверки карточки в админке (VED-384). Сервер присылает коды;
 * модератору нужны слова — и объяснение, почему машина не решила сама.
 */

const STATUS: Record<WellnessCheckStatus, string> = {
  queued: "Ждёт автопроверки",
  running: "ИИ проверяет",
  accepted: "Принята автоматически",
  refined: "Уточнена и принята",
  review: "Передана модератору",
  rejected: "Отклонена автоматически",
  cancelled: "Автопроверка отменена",
};

const REASON: Record<WellnessCheckReason, string> = {
  ai_unavailable: "Автопроверка выключена или ИИ не настроен",
  ai_failed: "Провайдер не ответил за три попытки",
  ai_unreadable: "Ответ ИИ не удалось разобрать",
  daily_budget: "Дневной лимит автопроверок исчерпан",
  user_daily_limit: "От этого человека много карточек за сутки",
  not_found: "ИИ не нашёл товар в открытых источниках",
  sources_conflict: "Источники расходятся — см. расхождения",
  too_few_sources: "Товар подтвердил меньше чем два независимых сайта",
  sources_unverified:
    "Ни одну страницу сервер не открыл со штрихкодом на ней",
  name_mismatch: "В источниках по этому штрихкоду другой товар",
  composition_unconfirmed:
    "Состав не найден на странице, проверенной сервером",
  composition_mismatch: "Состав в источниках заметно отличается от снимка",
  catalog_matches_differ:
    "Уточнённый состав меняет то, что находит справочник",
  not_food_unconfirmed: "ИИ считает, что это не еда, но подтвердить нечем",
  not_food: "Не продукт питания — подтверждено источниками",
};

const LEVEL: Record<WellnessCheckSourceLevel, string> = {
  verified: "сервер открыл, штрихкод на странице",
  opened: "открыт поиском, сервер не подтвердил",
  claimed: "только со слов ИИ",
};

export function checkStatusLabel(status: WellnessCheckStatus): string {
  return STATUS[status] ?? status;
}

/** Незнакомый код (новее этой сборки) показывается как есть, а не теряется. */
export function checkReasonLabel(reason: string): string {
  return REASON[reason as WellnessCheckReason] ?? reason;
}

export function sourceLevelLabel(level: WellnessCheckSourceLevel): string {
  return LEVEL[level] ?? level;
}

/** Стоимость проверки: доли цента в долларах не читаются. */
export function checkCostLabel(usd: number): string | null {
  if (!Number.isFinite(usd) || usd <= 0) return null;
  const cents = usd * 100;
  return cents < 1 ? "меньше цента" : `${cents.toFixed(1)} ¢`;
}

/** Поле, которое ИИ предлагает поменять: пустое и совпадающее — не показываем. */
export function proposedChange(
  submitted: string | null,
  proposed: string | null,
): string | null {
  const before = (submitted ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  const after = (proposed ?? "").replace(/\s+/g, " ").trim();
  if (!after || after.toLowerCase() === before) return null;
  return after;
}
