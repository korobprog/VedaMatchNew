/**
 * Поиск по списку знакомых в приглашении.
 *
 * Отдельно от сервиса, потому что вся суть здесь — в сравнении строк, а его
 * нужно проверять тестом, не поднимая Prisma.
 *
 * Через базу это сравнение не выразить: `contains` с `mode: 'insensitive'`
 * складывает регистр, но не ё с е — человек набирает «артем», в профиле
 * записано «Артём», и знакомый не находится. Кандидатов немного (это граф
 * доступа, а не портал целиком), поэтому фильтруем в памяти.
 */

/**
 * Строка в виде, в котором её сравнивают: без регистра, без ё и без лишних
 * пробелов. Ё складываем с е намеренно — на телефоне её печатают редко, и
 * человек, который ищет «Артема», имеет в виду «Артёма».
 */
export function foldName(value: string): string {
  return value.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

/**
 * Подходит ли человек под запрос. Совпадение ищем в любом из имён и по любой
 * их части: в приглашении набирают и мирское имя, и духовное, и фамилию.
 */
export function matchesContactQuery(
  person: { name: string; spiritualName?: string | null },
  query: string,
): boolean {
  const needle = foldName(query);
  if (!needle) return true;
  return [person.name, person.spiritualName ?? '']
    .map(foldName)
    .some((candidate) => candidate.includes(needle));
}
