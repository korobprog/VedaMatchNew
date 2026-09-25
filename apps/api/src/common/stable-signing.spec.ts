import { stableSignedTtl, stableSigningDate } from './stable-signing';

describe('stableSigningDate (VED-498)', () => {
  it('внутри окна — одна и та же дата', () => {
    const a = stableSigningDate(new Date('2026-09-25T00:10:00Z'));
    const b = stableSigningDate(new Date('2026-09-25T23:59:59Z'));
    expect(a).toEqual(b);
    expect(a.toISOString()).toBe('2026-09-25T00:00:00.000Z');
  });

  it('следующее окно — новая дата', () => {
    expect(stableSigningDate(new Date('2026-09-26T00:00:00Z'))).not.toEqual(
      stableSigningDate(new Date('2026-09-25T23:59:59Z')),
    );
  });

  it('срок жизни покрывает окно, но не больше семи суток', () => {
    expect(stableSignedTtl(3600)).toBe(3600 + 24 * 3600);
    expect(stableSignedTtl(7 * 24 * 3600)).toBe(7 * 24 * 3600);
  });
});
