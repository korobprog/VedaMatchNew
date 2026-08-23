import type { RewardsBalance, RewardsLedgerType } from '@vedamatch/shared';

/**
 * Баланс из леджера. Отдельной колонки баланса нет: она расходится с
 * историей молча и обнаруживается уже жалобой пользователя, а сумма по
 * строкам не расходится никогда.
 *
 * Двухфазное списание считается не как обычные строки:
 * - `reserve` держит сумму, но не тратит её — в `total` не входит;
 * - `commit` фиксирует трату — входит в `total` со знаком минус;
 * - `release` возвращает резерв — сумма нулевая, строка только закрывает
 *   резерв, чтобы он перестал висеть.
 *
 * Резерв считается открытым, пока на него не сослалась закрывающая строка
 * (`revokesId`). Так `available` честно показывает, чем можно распорядиться:
 * баллы, обещанные неоплаченному счёту, второй раз не потратишь.
 *
 * В режиме `beta` строк резерва не бывает вовсе, и `total` вырождается в
 * обычную сумму по леджеру.
 */

export interface LedgerRow {
  id: string;
  type: RewardsLedgerType;
  amount: number;
  /** Какую строку закрывает эта: отменяемое начисление или резерв. */
  revokesId?: string | null;
}

/** Типы, которые формируют сам баланс. Резерв и возврат в него не входят. */
const SETTLED_TYPES: ReadonlySet<RewardsLedgerType> = new Set([
  'welcome',
  'referral_l1',
  'referral_l2',
  'admin_revoke',
  'commit',
]);

export function balanceFromLedger(
  rows: ReadonlyArray<LedgerRow>,
): RewardsBalance {
  const closed = new Set<string>();
  for (const row of rows) {
    if (row.revokesId) closed.add(row.revokesId);
  }

  let total = 0;
  let reserved = 0;
  for (const row of rows) {
    if (SETTLED_TYPES.has(row.type)) {
      total += row.amount;
      continue;
    }
    if (row.type === 'reserve' && !closed.has(row.id)) {
      reserved += Math.abs(row.amount);
    }
  }

  // Отрицательный баланс — это ошибка данных, а не состояние счёта: показывать
  // человеку минус нельзя, но и прятать расхождение под нулём молча тоже, так
  // что ноль здесь только для витрины, а строки остаются как есть.
  const safeTotal = Math.max(0, total);
  return {
    total: safeTotal,
    reserved,
    available: Math.max(0, safeTotal - reserved),
  };
}

/** Отменена ли строка: на неё сослалась строка `admin_revoke`. */
export function revokedIds(rows: ReadonlyArray<LedgerRow>): Set<string> {
  const revoked = new Set<string>();
  for (const row of rows) {
    if (row.type === 'admin_revoke' && row.revokesId)
      revoked.add(row.revokesId);
  }
  return revoked;
}
