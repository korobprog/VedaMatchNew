import {
  CODE_ALPHABET,
  CODE_LENGTH,
  generatePublicCode,
  normalizePublicCode,
} from './public-code';

describe('generatePublicCode', () => {
  it('даёт код нужной длины из разрешённого алфавита', () => {
    const code = generatePublicCode();
    expect(code).toHaveLength(CODE_LENGTH);
    for (const char of code) expect(CODE_ALPHABET).toContain(char);
  });

  it('берёт знаки ровно по выданным числам', () => {
    const queue = [0, 1, 2, 3, 4, 5];
    const code = generatePublicCode(() => queue.shift() as number);
    expect(code).toBe(CODE_ALPHABET.slice(0, 6));
  });

  it('не содержит знаков, которые путают на слух', () => {
    for (const forbidden of ['0', 'O', '1', 'I', 'L']) {
      expect(CODE_ALPHABET).not.toContain(forbidden);
    }
  });
});

describe('normalizePublicCode', () => {
  it('поднимает регистр набранного руками кода', () => {
    expect(normalizePublicCode(' abc234 ')).toBe('ABC234');
  });

  it('отказывает коду не той длины', () => {
    expect(normalizePublicCode('ABC23')).toBeNull();
    expect(normalizePublicCode('ABC2345')).toBeNull();
  });

  it('отказывает знакам вне алфавита, а не чинит их', () => {
    expect(normalizePublicCode('ABC0EF')).toBeNull();
    expect(normalizePublicCode('ABC-EF')).toBeNull();
  });

  it('отказывает не-строке', () => {
    expect(normalizePublicCode(undefined)).toBeNull();
    expect(normalizePublicCode(123456)).toBeNull();
  });
});
