/**
 * Русское склонение по числу. Отдельный модуль, потому что счётчиков в
 * сервисе много — запросы, участники, каналы, подписчики, — и «1 каналов»
 * в одном месте достаточно, чтобы весь экран выглядел машинным.
 */
export function plural(
  count: number,
  one: string,
  few: string,
  many: string,
): string {
  const abs = Math.abs(Math.trunc(count));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/** Число вместе со словом: «1 канал», «2 канала», «5 каналов». */
export function withPlural(
  count: number,
  one: string,
  few: string,
  many: string,
): string {
  return `${count} ${plural(count, one, few, many)}`;
}
