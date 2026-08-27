import { COMPATIBILITY_CRITERIA } from "@/components/landing/deck-controls";
import type { BreakdownRow } from "@/components/landing/deck-controls";

/**
 * Пример расчёта совместимости для витрины.
 *
 * Настоящего процента у витрины быть не может: он считается относительно
 * смотрящего, а гость ещё не вошёл. Показывать вместо него пустое кольцо —
 * значит прятать главную идею сервиса; показывать число молча — значит
 * приписать живому человеку расчёт, которого не было. Поэтому число здесь
 * есть, но подписано примером — см. CompatibilityBreakdown.
 *
 * Два требования к этому примеру:
 *
 * 1. Он постоянен для анкеты. Случайное число менялось бы на каждом рендере
 *    и разошлось бы между сервером и браузером при гидратации.
 * 2. Его арифметика настоящая: итог равен сумме оценок по весам, той же
 *    формулой, что в `union-matching.service.ts`. Витрина обещает расчёт —
 *    и не имеет права показывать расчёт, который сам не сходится.
 */

/** Диапазон примера. Ниже 70 — «низкая совместимость», выше 96 — неправдоподобно. */
const MIN_TOTAL = 74;
const MAX_TOTAL = 96;

/**
 * Отклонения критериев от среднего — чтобы полоски были разной длины, а не
 * семью одинаковыми. Первый критерий не задан: он досчитывается так, чтобы
 * итог сошёлся ровно.
 */
const OFFSETS = [0, -5, 3, 6, -7, -9, 4];

/** Устойчивый хеш строки: одинаковый на сервере и в браузере. */
function hash(value: string): number {
  let acc = 0;
  for (let i = 0; i < value.length; i += 1) {
    acc = (acc * 31 + value.charCodeAt(i)) % 100000;
  }
  return acc;
}

/** Пример процента для анкеты: постоянный, в правдоподобном диапазоне. */
export function exampleCompatibility(id: string): number {
  return MIN_TOTAL + (hash(id) % (MAX_TOTAL - MIN_TOTAL + 1));
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}

const MAX_OFFSET = Math.max(...OFFSETS.map(Math.abs));

/**
 * Разбор примера. Первый критерий досчитывается из остальных, поэтому сумма
 * по весам совпадает с итогом до целого, а не «примерно».
 *
 * Отклонения ужимаются до запаса от итога к краю шкалы: у 96% просто нет
 * девяти процентов вверх, и без этого срезанная сверху оценка ломала бы
 * равенство — компенсировать её пришлось бы уходом первого критерия за 100.
 */
export function exampleBreakdown(total: number): BreakdownRow[] {
  const room = Math.min(total, 100 - total);
  const scale = MAX_OFFSET === 0 ? 0 : Math.min(1, room / MAX_OFFSET);

  const rest = COMPATIBILITY_CRITERIA.slice(1).map((row, index) => ({
    ...row,
    score: clamp(Math.round(total + OFFSETS[index + 1] * scale)),
  }));

  const restWeighted = rest.reduce((sum, row) => sum + row.score * row.weight, 0);
  const first = COMPATIBILITY_CRITERIA[0];
  const firstScore = clamp(
    Math.round((total * 100 - restWeighted) / first.weight),
  );

  return [{ ...first, score: firstScore }, ...rest];
}
