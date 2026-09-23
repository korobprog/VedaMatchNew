/**
 * Перестановка главы на одно место (VED-297). Отдельным модулем и под
 * тестом: у края списка перестановка обязана быть пустой, а не терять или
 * дублировать главу.
 */
export function moveChapter<T>(items: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= items.length) return items;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
