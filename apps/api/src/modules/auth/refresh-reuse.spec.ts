import {
  judgeRevokedRefresh,
  REFRESH_REUSE_GRACE_MS,
  rotationFamily,
} from './refresh-reuse';

describe('judgeRevokedRefresh', () => {
  const now = new Date('2026-09-17T09:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it('токен ротирован секунду назад — гонка, ничего не отзываем', () => {
    expect(
      judgeRevokedRefresh(
        { userId: 'u1', familyId: 'f1', revokedAt: ago(1_000) },
        now,
      ),
    ).toEqual({ kind: 'race' });
  });

  it('граница окна ещё гонка', () => {
    expect(
      judgeRevokedRefresh(
        { userId: 'u1', familyId: 'f1', revokedAt: ago(REFRESH_REUSE_GRACE_MS) },
        now,
      ).kind,
    ).toBe('race');
  });

  it('часы БД впереди API — отзыв всё равно свежий', () => {
    expect(
      judgeRevokedRefresh(
        { userId: 'u1', familyId: 'f1', revokedAt: new Date(now.getTime() + 500) },
        now,
      ).kind,
    ).toBe('race');
  });

  it('давно отозванный токен — отзыв только его семейства, не всех сессий', () => {
    expect(
      judgeRevokedRefresh(
        { userId: 'u1', familyId: 'f1', revokedAt: ago(REFRESH_REUSE_GRACE_MS + 1) },
        now,
      ),
    ).toEqual({
      kind: 'revoke-family',
      where: { userId: 'u1', familyId: 'f1', revoked: false },
    });
  });

  it('токен без даты отзыва (выход, блокировка, старые записи) — не гонка', () => {
    expect(
      judgeRevokedRefresh({ userId: 'u1', familyId: 'f1', revokedAt: null }, now)
        .kind,
    ).toBe('revoke-family');
  });

  it('токен из времён до семейств отзывает только безсемейные токены', () => {
    expect(
      judgeRevokedRefresh({ userId: 'u1', familyId: null, revokedAt: null }, now),
    ).toEqual({
      kind: 'revoke-family',
      where: { userId: 'u1', familyId: null, revoked: false },
    });
  });

  it('окно настраивается', () => {
    expect(
      judgeRevokedRefresh(
        { userId: 'u1', familyId: 'f1', revokedAt: ago(5_000) },
        now,
        1_000,
      ).kind,
    ).toBe('revoke-family');
  });
});

describe('rotationFamily', () => {
  it('наследует семейство', () => {
    expect(rotationFamily({ id: 't2', familyId: 'f1' })).toBe('f1');
  });

  it('старый токен без семейства открывает его своим id', () => {
    expect(rotationFamily({ id: 't1', familyId: null })).toBe('t1');
  });
});
