import type {
  NotificationAudienceFilter,
  NotificationBroadcastStatus,
} from "@vedamatch/shared";
import { roleLabels, stageLabels } from "@/lib/admin-labels";

export const broadcastStatusLabels: Record<
  NotificationBroadcastStatus,
  string
> = {
  draft: "Черновик",
  sending: "Отправляется",
  sent: "Отправлена",
  failed: "Ошибка",
  cancelled: "Отменена",
};

/**
 * Фильтр аудитории словами. Нужен и в списке, и в форме: набор чекбоксов
 * перечитывать глазами дольше, чем одну строку, а ошибка в аудитории — это
 * письмо не тем людям.
 */
export function describeAudience(filter: NotificationAudienceFilter): string {
  const parts: string[] = [];

  if (filter.stages && filter.stages.length > 0) {
    parts.push(filter.stages.map((stage) => stageLabels[stage]).join(", "));
  }
  if (filter.roles && filter.roles.length > 0) {
    parts.push(filter.roles.map((role) => roleLabels[role]).join(", "));
  }
  if (filter.payment === "paid") parts.push("платят");
  if (filter.payment === "unpaid") parts.push("не платят");
  if (filter.withPushOnly) parts.push("только с включённым пушем");

  if (parts.length === 0) return "Все активные аккаунты";
  return parts.join(" · ");
}
