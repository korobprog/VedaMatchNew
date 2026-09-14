import {
  canReviewBooking,
  parseReviewInput,
  ratingSummary,
} from './review-input';
import { TravelInputError } from './travel-dto';

describe('parseReviewInput', () => {
  it('оценка и текст без лишних пробелов', () => {
    expect(parseReviewInput({ rating: 5, text: '  Чисто и тихо ' })).toEqual({
      rating: 5,
      text: 'Чисто и тихо',
    });
  });

  it('текст необязателен — звёзд достаточно', () => {
    expect(parseReviewInput({ rating: 3 })).toEqual({ rating: 3, text: '' });
  });

  it.each([0, 6, 4.5, '5', null])('не принимает оценку %p', (rating) => {
    expect(() => parseReviewInput({ rating })).toThrow(TravelInputError);
  });

  it('ограничивает длину', () => {
    expect(() =>
      parseReviewInput({ rating: 4, text: 'а'.repeat(2001) }),
    ).toThrow('длиннее');
  });
});

describe('canReviewBooking', () => {
  it('после заезда — да, до заезда и после отказа — нет', () => {
    expect(canReviewBooking('checked_in')).toBe(true);
    expect(canReviewBooking('completed')).toBe(true);
    expect(canReviewBooking('new_request')).toBe(false);
    expect(canReviewBooking('accepted')).toBe(false);
    expect(canReviewBooking('declined')).toBe(false);
    expect(canReviewBooking('cancelled')).toBe(false);
  });
});

describe('ratingSummary', () => {
  it('среднее с одним знаком', () => {
    expect(ratingSummary(55, 12)).toEqual({ average: 4.6, count: 12 });
  });

  it('нет отзывов — нет среднего', () => {
    expect(ratingSummary(null, 0)).toEqual({ average: null, count: 0 });
    expect(ratingSummary(0, 0)).toEqual({ average: null, count: 0 });
  });
});
