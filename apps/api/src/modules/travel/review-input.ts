import {
  TRAVEL_REVIEW_TEXT_MAX,
  TRAVEL_REVIEWABLE_STATUSES,
  type TravelRatingSummary,
} from '@vedamatch/shared';
import { TravelInputError } from './travel-dto';

export const MIN_REVIEW_RATING = 1;
export const MAX_REVIEW_RATING = 5;

/** Оценка и текст отзыва. Ошибки — `TravelInputError`, сервис отвечает 400. */
export function parseReviewInput(body: Record<string, unknown>): {
  rating: number;
  text: string;
} {
  const rating = body.rating;
  if (
    typeof rating !== 'number' ||
    !Number.isInteger(rating) ||
    rating < MIN_REVIEW_RATING ||
    rating > MAX_REVIEW_RATING
  ) {
    throw new TravelInputError('Оценка — от 1 до 5 звёзд');
  }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (text.length > TRAVEL_REVIEW_TEXT_MAX) {
    throw new TravelInputError(
      `Отзыв длиннее ${TRAVEL_REVIEW_TEXT_MAX} знаков`,
    );
  }
  return { rating, text };
}

/**
 * Оставить отзыв можно только после заезда: оценка «хостел плохой» от того,
 * кто в нём не был, — это не отзыв, а мнение.
 */
export function canReviewBooking(status: string): boolean {
  return (TRAVEL_REVIEWABLE_STATUSES as readonly string[]).includes(status);
}

/**
 * Средняя оценка с одним знаком: «4,6», а не «4,5833». Сумма и число — как
 * их отдаёт агрегат базы; `null` у суммы — отзывов нет.
 */
export function ratingSummary(
  sum: number | null,
  count: number,
): TravelRatingSummary {
  if (!count || sum === null) return { average: null, count: 0 };
  return { average: Math.round((sum / count) * 10) / 10, count };
}
