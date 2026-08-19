export const MIN_RATING = 1;
export const MAX_RATING = 5;

export function isValidRating(rating: unknown): boolean {
  return (
    typeof rating === 'number' &&
    Number.isInteger(rating) &&
    rating >= MIN_RATING &&
    rating <= MAX_RATING
  );
}

/**
 * Атомарные шаги счётчиков магазина при добавлении или снятии отзыва.
 *
 * `ratingSum` держим отдельной колонкой, чтобы среднее считалось без
 * подзапроса — по нему сортируется справочник магазинов. Раньше агрегаты
 * считались read-modify-write внутри транзакции: два одновременных отзыва
 * читали одно и то же состояние и один из них терялся. Поэтому шаги —
 * `{ increment/decrement }` (Postgres применяет их к текущему значению строки),
 * а среднее пересчитывается отдельным атомарным UPDATE по уже обновлённым
 * колонкам — `MarketReviewsService.applyShopRatingDelta`.
 */
export function ratingCounterSteps(delta: {
  ratingSum: number;
  reviewsCount: number;
}): {
  ratingSum: { increment: number } | { decrement: number };
  reviewsCount: { increment: number } | { decrement: number };
} {
  return {
    ratingSum: step(delta.ratingSum),
    reviewsCount: step(delta.reviewsCount),
  };
}

function step(delta: number): { increment: number } | { decrement: number } {
  return delta >= 0 ? { increment: delta } : { decrement: -delta };
}

/** Ноль отзывов — это «оценок нет», а не «оценка ноль»: витрина показывает
 *  рейтинг, только когда reviewsCount больше нуля. Среднее округляем до сотых:
 *  показывать «4.333333» незачем, а хранить точнее, чем показываем, значит
 *  однажды получить расхождение между списком и карточкой. Та же формула
 *  живёт в SQL пересчёта (`applyShopRatingDelta`); `average` — её эталон
 *  для тестов. */
export function average(ratingSum: number, reviewsCount: number): number {
  if (reviewsCount <= 0) return 0;
  return Math.round((ratingSum / reviewsCount) * 100) / 100;
}

/** Разбивка «сколько отзывов на каждую оценку» для витрины. */
export function ratingBreakdown(ratings: number[]): Record<string, number> {
  const breakdown: Record<string, number> = {
    '1': 0,
    '2': 0,
    '3': 0,
    '4': 0,
    '5': 0,
  };
  for (const rating of ratings) {
    const key = String(rating);
    if (key in breakdown) breakdown[key] += 1;
  }
  return breakdown;
}
