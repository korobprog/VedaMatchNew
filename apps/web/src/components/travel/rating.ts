import type { TravelRatingSummary } from "@vedamatch/shared";
import { plural } from "@/lib/plural";

/** «4,6» — средняя оценка с запятой, как пишут по-русски. */
export function formatAverage(average: number): string {
  return average.toFixed(1).replace(".", ",");
}

export function reviewsWord(count: number): string {
  return `${count} ${plural(count, "отзыв", "отзыва", "отзывов")}`;
}

/** Подпись оценки у объекта: «4,6 · 12 отзывов» или «Отзывов пока нет». */
export function ratingLabel(summary: TravelRatingSummary): string {
  if (!summary.count || summary.average === null) return "Отзывов пока нет";
  return `${formatAverage(summary.average)} · ${reviewsWord(summary.count)}`;
}

/** Строка звёзд для глаз; для скринридера рядом всегда число словами. */
export function starsText(rating: number): string {
  const full = Math.max(0, Math.min(5, Math.round(rating)));
  return "★".repeat(full) + "☆".repeat(5 - full);
}

export function starsLabel(rating: number): string {
  return `${rating} ${plural(rating, "звезда", "звезды", "звёзд")} из 5`;
}
