/**
 * Повторное предъявление отозванного refresh-токена: что отзывать и когда
 * это вообще не кража.
 *
 * Раньше повтор отзывал все токены человека. В проде это выглядело так:
 * вкладка сайта с отозванной cookie (проиграла гонку ротации или пережила
 * чужой отзыв) переподключала поток событий через `/auth/refresh` каждые
 * ≤15 секунд, и каждый такой повтор отзывал все сессии человека. Приложение
 * на телефоне теряло вход через 10–70 секунд после каждого входа, а после
 * обновления APK — при первом же refresh на старте (VED-233).
 *
 * Теперь:
 * - у каждого входа своё семейство токенов (`familyId`), ротация его
 *   наследует; повтор отзывает только своё семейство — вкладка сайта не
 *   может выкинуть приложение, и наоборот;
 * - повтор токена, отозванного ротацией только что (`revokedAt` моложе
 *   окна), — гонка двух запросов одного клиента: только 401, без отзыва;
 * - токены, отозванные до появления семейств (`familyId = null`), отзывают
 *   лишь такие же безсемейные живые токены человека.
 *
 * Новой пары по отозванному токену не выдаётся никогда, даже в окне.
 */

/** Окно, в котором повтор только что ротированного токена считается гонкой. */
export const REFRESH_REUSE_GRACE_MS = 60_000;

export interface RevokedRefreshToken {
  userId: string;
  familyId: string | null;
  revokedAt: Date | null;
}

export type RevokedRefreshVerdict =
  | { kind: 'race' }
  | {
      kind: 'revoke-family';
      where: { userId: string; familyId: string | null; revoked: false };
    };

export function judgeRevokedRefresh(
  token: RevokedRefreshToken,
  now: Date,
  graceMs = REFRESH_REUSE_GRACE_MS,
): RevokedRefreshVerdict {
  if (token.revokedAt) {
    const age = now.getTime() - token.revokedAt.getTime();
    // Отрицательный возраст — часы БД впереди часов API: отзыв тоже свежий.
    if (age <= graceMs) return { kind: 'race' };
  }
  return {
    kind: 'revoke-family',
    where: { userId: token.userId, familyId: token.familyId, revoked: false },
  };
}

/**
 * Семейство, которое ротация передаёт новому токену. Токен из времён до
 * семейств открывает своё — по собственному id; этим же id его помечают при
 * отзыве, чтобы повтор нашёл продолжение цепочки.
 */
export function rotationFamily(token: { id: string; familyId: string | null }): string {
  return token.familyId ?? token.id;
}
