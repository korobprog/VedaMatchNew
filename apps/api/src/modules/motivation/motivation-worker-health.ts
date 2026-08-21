/**
 * Срок лиза задачи. Тик воркера считает просроченным всё, что висит в
 * `generating` дольше пяти минут; админка показывает такие задачи как зависшие,
 * чтобы «висит» и «будет восстановлено» означали одно и то же.
 */
export const MOTIVATION_LEASE_MS = 5 * 60_000;

/**
 * Граница «задача зависла». Отдельной функцией: время — единственное, что
 * здесь можно перепутать, и это стоит теста.
 */
export function stuckSince(now: Date, leaseMs = MOTIVATION_LEASE_MS): Date {
  return new Date(now.getTime() - leaseMs);
}

/**
 * Воркер считается живым, если тик был не дольше срока лиза назад: сам он
 * тикает раз в 30 секунд, так что пять минут молчания — уже поломка. Считается
 * на сервере: часы браузера админа для этого не годятся.
 */
export function isWorkerAlive(
  lastTickAt: Date | null,
  now: Date,
  leaseMs = MOTIVATION_LEASE_MS,
): boolean {
  if (!lastTickAt) return false;
  return now.getTime() - lastTickAt.getTime() < leaseMs;
}
