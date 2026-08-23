/**
 * Месячный потолок начислений на человека. Не украшение антифрода: без него
 * одна удачно раскрученная цепочка выносит весь бюджет программы за сутки,
 * а разбираться приходится уже с выданными баллами.
 */

export interface CappedAward {
  /** Сколько реально начислить. Ноль — потолок выбран целиком. */
  granted: number;
  /** Сколько срезал потолок. */
  withheld: number;
  /** Уперлись ли в потолок: по этому флагу пишется журнал подозрений. */
  capped: boolean;
}

/**
 * Сколько из `amount` можно начислить, если за месяц уже начислено
 * `earnedThisMonth` при потолке `cap`.
 *
 * Потолок режет, а не отменяет: половина начисления лучше нуля, и остаток
 * не переносится на следующий месяц — иначе потолок перестаёт быть потолком.
 * `cap <= 0` читается как «без ограничения»: обнулять программу настройкой
 * потолка нельзя, для этого есть номиналы.
 */
export function applyMonthlyCap(
  amount: number,
  earnedThisMonth: number,
  cap: number,
): CappedAward {
  const wanted = Math.max(0, Math.trunc(amount));
  if (cap <= 0) return { granted: wanted, withheld: 0, capped: false };

  const remaining = Math.max(0, cap - Math.max(0, earnedThisMonth));
  const granted = Math.min(wanted, remaining);
  return {
    granted,
    withheld: wanted - granted,
    capped: granted < wanted,
  };
}

/**
 * Границы календарного месяца в UTC. Считаем по UTC, а не по часовому поясу
 * человека: портал живёт в десятке поясов, и «месяц» обязан быть один и тот
 * же для всех, иначе потолок обходится сменой настроек устройства.
 */
export function monthWindow(now: Date): { from: Date; to: Date } {
  const from = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const to = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  );
  return { from, to };
}

/**
 * Сколько начислено за месяц. Считаются только положительные строки:
 * отменённое администратором начисление уходит отдельной строкой со знаком
 * минус, и вычитать его из счётчика значило бы возвращать человеку право
 * заработать столько же снова — ровно то, чего отмена не хотела.
 */
export function earnedInWindow(
  entries: ReadonlyArray<{ amount: number; createdAt: Date }>,
  window: { from: Date; to: Date },
): number {
  return entries.reduce((sum, entry) => {
    if (entry.amount <= 0) return sum;
    if (entry.createdAt < window.from || entry.createdAt >= window.to)
      return sum;
    return sum + entry.amount;
  }, 0);
}
