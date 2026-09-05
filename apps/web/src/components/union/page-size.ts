/**
 * Сколько анкет показывать за раз.
 *
 * Двенадцать — по умолчанию с самого начала сервиса, и это разумно на
 * телефоне. На большом экране в двенадцати анкетах смысла мало: сетка
 * заканчивается, не дойдя до низа окна, и человек листает страницами то, что
 * поместилось бы целиком.
 *
 * Потолок — пятьдесят: столько принимает API (`MAX_PAGE_SIZE` в
 * `union-profile.service.ts`), и просить больше значит молча получить
 * обрезанный ответ. Сорок восемь, а не пятьдесят, потому что делится и на
 * два, и на три, и на четыре — по стольку анкет стоит в ряду при разной
 * ширине, и последний ряд не остаётся щербатым.
 */
export const UNION_PAGE_SIZES = [12, 24, 48] as const;

export type UnionPageSize = (typeof UNION_PAGE_SIZES)[number];

export const DEFAULT_UNION_PAGE_SIZE: UnionPageSize = 12;

/**
 * Значение из адреса — в размер страницы. Всё, чего нет в списке, считается
 * значением по умолчанию: адрес правят руками, и «показать 5000 анкет» не
 * должно ни падать, ни исполняться.
 */
export function resolveUnionPageSize(
  value: string | string[] | undefined,
): UnionPageSize {
  const first = Array.isArray(value) ? value[0] : value;
  const parsed = Number(first);
  return (UNION_PAGE_SIZES as readonly number[]).includes(parsed)
    ? (parsed as UnionPageSize)
    : DEFAULT_UNION_PAGE_SIZE;
}
