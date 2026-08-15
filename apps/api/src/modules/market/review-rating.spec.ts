import {
  MAX_RATING,
  MIN_RATING,
  applyRatingDelta,
  average,
  isValidRating,
  ratingBreakdown,
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

describe('applyRatingDelta', () => {
  it('adds a review', () => {
    expect(
      applyRatingDelta(
        { ratingSum: 0, reviewsCount: 0 },
        { ratingSum: 5, reviewsCount: 1 },
      ),
    ).toEqual({ ratingSum: 5, reviewsCount: 1, ratingAvg: 5 });
  });

  it('averages several reviews', () => {
    const one = applyRatingDelta(
      { ratingSum: 0, reviewsCount: 0 },
      { ratingSum: 5, reviewsCount: 1 },
    );
    const two = applyRatingDelta(one, { ratingSum: 4, reviewsCount: 1 });
    expect(two).toEqual({ ratingSum: 9, reviewsCount: 2, ratingAvg: 4.5 });
  });

  it('removes a review and restores the previous average', () => {
    const after = applyRatingDelta(
      { ratingSum: 9, reviewsCount: 2 },
      { ratingSum: -4, reviewsCount: -1 },
    );
    expect(after).toEqual({ ratingSum: 5, reviewsCount: 1, ratingAvg: 5 });
  });

  it('drops back to zero when the last review goes', () => {
    expect(
      applyRatingDelta(
        { ratingSum: 5, reviewsCount: 1 },
        { ratingSum: -5, reviewsCount: -1 },
      ),
    ).toEqual({ ratingSum: 0, reviewsCount: 0, ratingAvg: 0 });
  });

  // Счётчики денормализованы: рассинхрон возможен, и уводить их в минус —
  // значит получить отрицательный рейтинг на витрине.
  it('never goes negative even if the counters drifted', () => {
    expect(
      applyRatingDelta(
        { ratingSum: 0, reviewsCount: 0 },
        { ratingSum: -5, reviewsCount: -1 },
      ),
    ).toEqual({ ratingSum: 0, reviewsCount: 0, ratingAvg: 0 });
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
    expect(Object.values(ratingBreakdown([0, 6])).reduce((a, b) => a + b, 0)).toBe(0);
  });
});
