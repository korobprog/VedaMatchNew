import { calculateAge, parseBirthDate, toBirthDateInput } from './age';

const now = new Date('2026-07-28T00:00:00.000Z');

describe('calculateAge', () => {
  it.each([
    ['1996-07-28', 30],
    ['1996-07-29', 29],
    ['1996-12-31', 29],
    ['1997-01-01', 29],
  ])('counts full years for %s', (birthDate, expected) => {
    expect(calculateAge(new Date(`${birthDate}T00:00:00.000Z`), now)).toBe(
      expected,
    );
  });

  it('returns null without a birth date', () => {
    expect(calculateAge(null, now)).toBeNull();
  });
});

describe('parseBirthDate', () => {
  it('clears the value for empty input', () => {
    expect(parseBirthDate('')).toBeNull();
    expect(parseBirthDate(null)).toBeNull();
  });

  it('accepts a valid adult date', () => {
    expect(parseBirthDate('1990-05-14')).toEqual(
      new Date('1990-05-14T00:00:00.000Z'),
    );
  });

  it.each(['14.05.1990', '1990-13-01', 'вчера'])(
    'rejects malformed input %p',
    (value) => {
      expect(parseBirthDate(value)).toHaveProperty('error');
    },
  );

  it('rejects users under 18', () => {
    const recent = new Date();
    recent.setUTCFullYear(recent.getUTCFullYear() - 17);
    const result = parseBirthDate(recent.toISOString().slice(0, 10));

    expect(result).toEqual({ error: 'Знакомства доступны с 18 лет' });
  });
});

describe('toBirthDateInput', () => {
  it('formats the date for a form field', () => {
    expect(toBirthDateInput(new Date('1990-05-14T00:00:00.000Z'))).toBe(
      '1990-05-14',
    );
    expect(toBirthDateInput(null)).toBeNull();
  });
});
