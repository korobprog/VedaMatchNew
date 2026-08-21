import type { Prisma } from '@prisma/client';
import type { LibraryAdminEntryQuery } from '@vedamatch/shared';

/**
 * Фильтры списка записей. Поиск идёт и по адресу, и по заголовкам: проблемную
 * запись ищут то по ссылке из жалобы, то по названию из ленты.
 */
export function buildEntryWhere(
  query: LibraryAdminEntryQuery,
): Prisma.LibraryEntryWhereInput {
  const where: Prisma.LibraryEntryWhereInput = {};

  if (query.status) where.status = query.status;

  // Обогащение проставляет `ready` только после успешного разбора страницы,
  // поэтому «не ready» и есть «карточка без обложки и заголовка».
  if (query.notEnrichedOnly) where.enrichmentStatus = { not: 'ready' };

  const q = query.q?.trim();
  if (q) {
    where.OR = [
      { url: { contains: q, mode: 'insensitive' } },
      { domain: { contains: q, mode: 'insensitive' } },
      { titleRu: { contains: q, mode: 'insensitive' } },
      { titleEn: { contains: q, mode: 'insensitive' } },
    ];
  }
  return where;
}

/**
 * Группировка по ключу с отбрасыванием одиночек. Вынесено отдельно: «дубль» —
 * это два и более, и группа из одного элемента в выдаче только мешает.
 */
export function groupDuplicates<T>(
  items: Array<{ row: T; key: string }>,
): Array<{ key: string; rows: T[] }> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    if (!item.key) continue;
    const bucket = groups.get(item.key);
    if (bucket) bucket.push(item.row);
    else groups.set(item.key, [item.row]);
  }
  return [...groups.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({ key, rows }));
}
