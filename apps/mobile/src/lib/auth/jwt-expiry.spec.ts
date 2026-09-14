import { msUntilRefresh, readJwtExpiryMs } from './jwt-expiry';

function token(payload: object): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'RS256' })}.${encode(payload)}.signature`;
}

describe('readJwtExpiryMs', () => {
  it('читает exp в миллисекундах', () => {
    expect(readJwtExpiryMs(token({ exp: 1_800_000_000 }))).toBe(1_800_000_000_000);
  });

  it('читает payload с символами base64url', () => {
    // Имя подобрано так, чтобы в base64 появились `+` и `/`.
    const value = token({ exp: 1_800_000_000, name: '>>>???' });
    expect(value).toMatch(/[-_]/);
    expect(readJwtExpiryMs(value)).toBe(1_800_000_000_000);
  });

  it('возвращает null на мусоре, а не падает', () => {
    expect(readJwtExpiryMs('not-a-jwt')).toBeNull();
    expect(readJwtExpiryMs('a.%%%.c')).toBeNull();
    expect(readJwtExpiryMs(token({ sub: 'u1' }))).toBeNull();
    expect(readJwtExpiryMs(token({ exp: '1800000000' }))).toBeNull();
  });
});

describe('msUntilRefresh', () => {
  const now = 1_800_000_000_000;

  it('ждёт до истечения минус запас', () => {
    const value = token({ exp: now / 1000 + 15 * 60 });
    expect(msUntilRefresh(value, now)).toBe(14 * 60 * 1000);
  });

  it('обновляет сразу, если токен истекает внутри запаса', () => {
    expect(msUntilRefresh(token({ exp: now / 1000 + 30 }), now)).toBe(0);
  });

  it('обновляет сразу без токена или с нечитаемым токеном', () => {
    expect(msUntilRefresh(null, now)).toBe(0);
    expect(msUntilRefresh('garbage', now)).toBe(0);
  });
});
