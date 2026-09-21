import type {
  NotificationDeliveryPointKind,
  NotificationDeliveryPointState,
} from "@vedamatch/shared";
import { plural } from "@/lib/plural";

/**
 * Подписи раздела «Доставка» в админке (VED-314). Чистые функции без React:
 * состояние точки доставки решает API (правило живёт там, в одном месте с
 * отправкой), а как это назвать по-русски — забота клиента, как и во всём
 * портале.
 */

const STATE_LABELS: Record<NotificationDeliveryPointState, string> = {
  alive: "Живая",
  silent: "Молчит",
  dead: "Помечена мёртвой",
};

export function deliveryStateLabel(
  state: NotificationDeliveryPointState,
): string {
  return STATE_LABELS[state] ?? state;
}

/** Тон значка: «плохо» отдаётся только помеченным — молчание ещё не приговор. */
export type DeliveryTone = "ok" | "warn" | "bad";

export function deliveryStateTone(
  state: NotificationDeliveryPointState,
): DeliveryTone {
  if (state === "dead") return "bad";
  return state === "silent" ? "warn" : "ok";
}

const KIND_LABELS: Record<NotificationDeliveryPointKind, string> = {
  web: "Браузер",
  app: "Приложение",
  telegram: "Telegram",
};

export function deliveryKindLabel(
  kind: NotificationDeliveryPointKind,
): string {
  return KIND_LABELS[kind] ?? kind;
}

/**
 * «Когда точка последний раз принимала пуш». Пустая отметка — «ни разу»: у
 * подписки, которой ничего не отправляли, её и не может быть, и врать «только
 * что» здесь нельзя.
 *
 * Дни, а не время: администратор смотрит раздел, чтобы понять, месяц назад это
 * было или вчера.
 */
export function daysAgoLabel(iso: string | null, now: Date): string {
  if (!iso) return "ни разу";
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "ни разу";
  const days = Math.floor((now.getTime() - at) / (24 * 60 * 60 * 1000));
  // Отрицательное — часы клиента и сервера разошлись; «только что» честнее,
  // чем «−1 день назад».
  if (days <= 0) return "сегодня";
  if (days === 1) return "вчера";
  return `${days} ${plural(days, "день", "дня", "дней")} назад`;
}

/** Строка про неудачи: ноль не показываем — она ни о чём не говорит. */
export function failureStreakLabel(failureCount: number): string | null {
  if (failureCount <= 0) return null;
  return `${failureCount} ${plural(failureCount, "отказ", "отказа", "отказов")} подряд`;
}
