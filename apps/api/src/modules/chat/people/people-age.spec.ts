import { calculateAge } from './people-age';

describe('calculateAge', () => {
  const now = new Date('2026-08-22T00:00:00.000Z');

  it('без даты рождения возраста нет', () => {
    expect(calculateAge(null, now)).toBeNull();
    expect(calculateAge(undefined, now)).toBeNull();
  });

  it('считает полные годы', () => {
    expect(calculateAge(new Date('1990-08-22T00:00:00.000Z'), now)).toBe(36);
    expect(calculateAge(new Date('1990-08-21T00:00:00.000Z'), now)).toBe(36);
  });

  it('день рождения ещё не наступил — годом меньше', () => {
    expect(calculateAge(new Date('1990-08-23T00:00:00.000Z'), now)).toBe(35);
    expect(calculateAge(new Date('1990-12-01T00:00:00.000Z'), now)).toBe(35);
  });
});
