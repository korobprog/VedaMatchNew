import {
  MAX_RATING,
  MIN_RATING,
  average,
  isValidRating,
  ratingBreakdown,
  ratingCounterSteps,
} from './review-rating';

describe('isValidRating', () => {
  it('accepts whole stars from one to five', () => {
    for (let rating = MIN_RATING; rating <= MAX_RATING; rating += 1) {
      expect(isValidRating(rating)).toBe(true);
    }
  });

  it('rejects out-of-range values', () => {
    expect(isValidRating(0)).toBe(false);
    expect(isValidRating(6)).toBe(false);
    expect(isValidRating(-1)).toBe(false);
  });

  it('rejects half stars and non-numbers', () => {
    expect(isValidRating(4.5)).toBe(false);
    expect(isValidRating('5')).toBe(false);
    expect(isValidRating(null)).toBe(false);
    expect(isValidRating(undefined)).toBe(false);
    expect(isValidRating(Number.NaN)).toBe(false);
  });
});

describe('average', () => {
  // Ноль отзывов — «оценок нет», а не «оценка ноль»; витрина скрывает рейтинг.
  it('returns 0 without reviews instead of NaN', () => {
    expect(average(0, 0)).toBe(0);
    expect(average(0, 0)).not.toBeNaN();
  });

  it('rounds to two decimals', () => {
    expect(average(13, 3)).toBe(4.33);
    expect(average(9, 2)).toBe(4.5);
    expect(average(5, 1)).toBe(5);
  });
});

describe('ratingCounterSteps', () => {
  // Шаги атомарные: Postgres прибавляет к текущему значению строки, поэтому два
  // одновременных отзыва не затирают друг друга, как при read-modify-write.
  it('adds a review as increments', () => {
    expect(ratingCounterSteps({ ratingSum: 5, reviewsCount: 1 })).toEqual({
      ratingSum: { increment: 5 },
      reviewsCount: { increment: 1 },
    });
  });

  it('removes a review as decrements', () => {
    expect(ratingCounterSteps({ ratingSum: -4, reviewsCount: -1 })).toEqual({
      ratingSum: { decrement: 4 },
      reviewsCount: { decrement: 1 },
    });
  });

  it('treats zero as a no-op increment', () => {
    expect(ratingCounterSteps({ ratingSum: 0, reviewsCount: 0 })).toEqual({
      ratingSum: { increment: 0 },
      reviewsCount: { increment: 0 },
    });
  });
});

describe('ratingBreakdown', () => {
  it('counts every star bucket, including the empty ones', () => {
    expect(ratingBreakdown([5, 5, 4, 1])).toEqual({
      '1': 1,
      '2': 0,
      '3': 0,
      '4': 1,
      '5': 2,
    });
  });

  it('returns all zeroes for no reviews', () => {
    expect(ratingBreakdown([])).toEqual({
      '1': 0,
      '2': 0,
      '3': 0,
      '4': 0,
      '5': 0,
    });
  });

  it('ignores values outside the scale', () => {
    expect(ratingBreakdown([0, 6, 3])['3']).toBe(1);
    expect(
      Object.values(ratingBreakdown([0, 6])).reduce((a, b) => a + b, 0),
    ).toBe(0);
  });
});
