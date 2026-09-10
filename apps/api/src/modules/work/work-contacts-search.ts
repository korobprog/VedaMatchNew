/**
 * Поиск людей в приглашении в рабочую среду.
 *
 * Отдельно от сервиса, потому что вся суть здесь — в сравнении строк, а его
 * нужно проверять тестом, не поднимая Prisma.
 *
 * Готовым `contains` с `mode: 'insensitive'` это сравнение не выразить: он
 * складывает регистр, но не ё с е — человек набирает «артем», в профиле
 * записано «Артём», и знакомый не находится. Поэтому по короткому списку
 * знакомых фильтруем в памяти (`matchesContactQuery`), а по всему порталу —
 * запросом с `translate` в SQL, для которого здесь готовится образец
 * (`likeNeedle`). Правило про ё одно на оба пути и живёт в `foldName`.
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

/** Наименьшая длина запроса для поиска по всему порталу. */
export const PORTAL_SEARCH_MIN = 2;

/**
 * Образец для `LIKE` при поиске по всему порталу: та же свёрнутая строка, что
 * и в памяти, только обёрнутая в проценты.
 *
 * `%`, `_` и обратный слэш экранируем: без этого запрос «%» вытащил бы весь
 * портал, а «_» совпал бы с любой буквой. Экранирующий символ задаётся в
 * самом SQL через `ESCAPE`, иначе Postgres его не знает.
 *
 * Пустой (или слишком короткий) запрос образца не даёт: по всему порталу
 * искать «всех» незачем, и в этом случае сервис ничего не спрашивает у базы.
 */
export function likeNeedle(query: string): string | null {
  const folded = foldName(query);
  if (folded.length < PORTAL_SEARCH_MIN) return null;
  const escaped = folded.replace(/[\\%_]/g, (char) => `\\${char}`);
  return `%${escaped}%`;
}
