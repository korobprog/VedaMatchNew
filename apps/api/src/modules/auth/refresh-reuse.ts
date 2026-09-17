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
 *   окна), — тот же клиент: две вкладки обновились одновременно, или ответ
 *   с новой парой потерялся в мобильной сети и клиент остался со старой
 *   cookie. Такому повтору выдаётся ещё одна пара того же семейства — иначе
 *   проигравшая вкладка уходила на лендинг, а телефон после обрыва через
 *   минуту терял вход совсем. Пара выдаётся, только если у семейства ещё
 *   есть живой токен (см. `AuthService.consumeRefreshToken`): после выхода
 *   или отзыва семейства окно ничего не возвращает;
 * - токены, отозванные до появления семейств (`familyId = null`), отзывают
 *   лишь такие же безсемейные живые токены человека.
 */

/**
 * Окно, в котором повтор только что ротированного токена — свой клиент.
 * Две минуты покрывают таймаут запроса на плохой мобильной связи: клиент,
 * не дождавшийся ответа, повторяет refresh со старой cookie.
 */
export const REFRESH_REUSE_GRACE_MS = 120_000;

export interface RevokedRefreshToken {
  id: string;
  userId: string;
  familyId: string | null;
  revokedAt: Date | null;
}

export type RevokedRefreshVerdict =
  | { kind: 'reissue'; familyId: string }
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
    if (age <= graceMs) {
      return { kind: 'reissue', familyId: rotationFamily(token) };
    }
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
export function rotationFamily(token: {
  id: string;
  familyId: string | null;
}): string {
  return token.familyId ?? token.id;
}
