import type { TravelMapFreshnessDto } from "@vedamatch/shared";
import { plural } from "@/lib/plural";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Подпись свежести данных места для карточки. */
export function freshnessLabel(
  freshness: Pick<TravelMapFreshnessDto, "lastConfirmedAt" | "stale">,
  now: Date,
): string {
  if (freshness.stale) return "Давно не проверялось";
  if (!freshness.lastConfirmedAt) return "Ещё никто не подтверждал";
  const days = Math.max(
    0,
    Math.floor((now.getTime() - new Date(freshness.lastConfirmedAt).getTime()) / DAY_MS),
  );
  if (days === 0) return "Подтверждено сегодня";
  return `Подтверждено ${days} ${plural(days, "день", "дня", "дней")} назад`;
}

/** Предупреждение, если люди отмечали «закрылось». */
export function closedWarning(
  freshness: Pick<TravelMapFreshnessDto, "closedVotes">,
): string | null {
  const n = freshness.closedVotes;
  if (n <= 0) return null;
  return `${n} ${plural(n, "человек отметил", "человека отметили", "человек отметили")}: закрылось`;
}
