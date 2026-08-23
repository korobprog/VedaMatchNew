/**
 * Кому и сколько идёт за одного квалифицированного приглашённого.
 *
 * Программа двухуровневая и в глубину не растёт: A привёл B, B привёл C —
 * когда C выполнил условие, B получает уровень 1, A уровень 2, и на этом
 * цепочка обрывается. Глубже начислений нет намеренно: с третьего уровня
 * схема перестаёт быть «приведи друга» и начинает выглядеть пирамидой.
 */

export interface ReferralNominals {
  levelOnePoints: number;
  levelTwoPoints: number;
}

/**
 * Цепочка над приглашённым. Дальше деда читать нечего — уровня 3 не
 * существует, и в базе он не хранится: `level` вычисляется, а не пишется.
 */
export interface ReferralChain {
  inviteeId: string;
  /** Кто пригласил приглашённого. */
  inviterId: string;
  /** Кто пригласил пригласившего; `null` — тот пришёл сам. */
  grandInviterId: string | null;
}

export interface ReferralPayout {
  userId: string;
  level: 1 | 2;
  points: number;
}

/**
 * Начисления за одного приглашённого. Пустой массив — законный ответ:
 * номинал могли обнулить в админке.
 *
 * Отсекаются три вырожденных случая, каждый из которых в базе возможен:
 * начисление самому себе (цикл в цепочке), дед, совпадающий с отцом (тот же
 * цикл на два звена), и неположительный номинал.
 */
export function referralPayouts(
  chain: ReferralChain,
  nominals: ReferralNominals,
): ReferralPayout[] {
  const payouts: ReferralPayout[] = [];
  const { inviteeId, inviterId, grandInviterId } = chain;

  if (inviterId !== inviteeId && nominals.levelOnePoints > 0) {
    payouts.push({
      userId: inviterId,
      level: 1,
      points: nominals.levelOnePoints,
    });
  }
  if (
    grandInviterId &&
    grandInviterId !== inviteeId &&
    grandInviterId !== inviterId &&
    nominals.levelTwoPoints > 0
  ) {
    payouts.push({
      userId: grandInviterId,
      level: 2,
      points: nominals.levelTwoPoints,
    });
  }
  return payouts;
}

/**
 * Уровень человека относительно смотрящего: 1 — привёл сам, 2 — привёл его
 * приглашённый. Нужен экрану рефералов, где оба уровня в одном списке.
 *
 * `parentOf` — карта «приглашённый → пригласивший», собранная одним запросом:
 * рекурсивный обход базы ради двух шагов не нужен.
 */
export function referralLevel(
  viewerId: string,
  inviteeId: string,
  parentOf: ReadonlyMap<string, string>,
): 1 | 2 | null {
  const parent = parentOf.get(inviteeId);
  if (!parent) return null;
  if (parent === viewerId) return 1;
  const grandParent = parentOf.get(parent);
  if (grandParent === viewerId) return 2;
  return null;
}
