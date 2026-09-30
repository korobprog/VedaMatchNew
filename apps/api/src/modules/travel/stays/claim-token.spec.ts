import { generateClaimToken, normalizeClaimToken } from './claim-token';

describe('generateClaimToken', () => {
  it('32 знака base64url из 24 случайных байт', () => {
    const token = generateClaimToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it('берёт байты из переданного источника', () => {
    expect(generateClaimToken((size) => Buffer.alloc(size, 0xff))).toBe(
      '________________________________',
    );
  });

  it('два токена подряд не совпадают', () => {
    expect(generateClaimToken()).not.toBe(generateClaimToken());
  });
});

describe('normalizeClaimToken', () => {
  it('пропускает свой формат', () => {
    const token = generateClaimToken();
    expect(normalizeClaimToken(token)).toBe(token);
  });

  it.each([undefined, null, 42, '', 'short', ' '.repeat(32), 'a'.repeat(33)])(
    'отклоняет %p',
    (value) => {
      expect(normalizeClaimToken(value)).toBeNull();
    },
  );

  it('не обрезает пробелы: токен копируют целиком, а не исправляют', () => {
    expect(normalizeClaimToken(` ${generateClaimToken()}`)).toBeNull();
  });
});
