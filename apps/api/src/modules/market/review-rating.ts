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
 * Пересчёт агрегатов магазина при добавлении или снятии отзыва.
 *
 * `ratingSum` держим отдельной колонкой, чтобы среднее считалось без
 * подзапроса — по нему сортируется справочник магазинов. Среднее округляем
 * до сотых: показывать «4.333333» незачем, а хранить точнее, чем показываем,
 * значит однажды получить расхождение между списком и карточкой.
 */
export function applyRatingDelta(
  current: { ratingSum: number; reviewsCount: number },
  delta: { ratingSum: number; reviewsCount: number },
): { ratingSum: number; reviewsCount: number; ratingAvg: number } {
  const ratingSum = Math.max(0, current.ratingSum + delta.ratingSum);
  const reviewsCount = Math.max(0, current.reviewsCount + delta.reviewsCount);
  return { ratingSum, reviewsCount, ratingAvg: average(ratingSum, reviewsCount) };
}

/** Ноль отзывов — это «оценок нет», а не «оценка ноль»: витрина показывает
 *  рейтинг, только когда reviewsCount больше нуля. */
export function average(ratingSum: number, reviewsCount: number): number {
  if (reviewsCount <= 0) return 0;
  return Math.round((ratingSum / reviewsCount) * 100) / 100;
}

/** Разбивка «сколько отзывов на каждую оценку» для витрины. */
export function ratingBreakdown(
  ratings: number[],
): Record<string, number> {
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
