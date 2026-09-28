import type { Prisma } from '@prisma/client';
import {
  isBlogPostCategory,
  isLineageId,
  lineageFilterIds,
  type BlogPostCategory,
  type LineageId,
} from '@vedamatch/shared';

/**
 * Фильтры Блог-ленты и разбор назначаемых посту значений.
 *
 * Чистая логика отдельно от сервиса: её проверяют тесты без базы, а сервис
 * только складывает готовые условия в `where`.
 */

/**
 * Линия, которую администратор назначает посту (VED-596): идентификатор
 * справочника либо `null` — «без линии, для всех». Всё остальное —
 * `'invalid'`, чтобы мусор из тела запроса отвечал 400, а не доезжал до базы.
 * Группа (`group:gaudiya_math`) посту не назначается: у поста, как у
 * материала Образования, линия всегда конкретная.
 */
export function blogLineageInput(value: unknown): LineageId | null | 'invalid' {
  if (value === null || value === undefined || value === '') return null;
  return isLineageId(value) ? value : 'invalid';
}

/**
 * Категория, которую автор назначает посту (VED-590).
 *
 * - `undefined` — поля в запросе нет: при правке категория прежняя;
 * - `null` — снять категорию. Пустая строка значит то же: multipart не умеет
 *   передать `null`, а поле формы «Без категории» уезжает пустым;
 * - `'invalid'` — не из списка, запрос отвечает 400.
 */
export function blogCategoryInput(
  value: unknown,
): BlogPostCategory | null | undefined | 'invalid' {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return isBlogPostCategory(value) ? value : 'invalid';
}

/**
 * Условие ленты по категории (VED-590): только выбранная, остальные скрыты.
 * Пусто, «все» или мусор — фильтра нет: испорченный адрес должен вернуть
 * ленту, а не пустоту.
 */
export function blogCategoryWhere(
  filter: unknown,
): Prisma.BlogPostWhereInput | null {
  return isBlogPostCategory(filter) ? { category: filter } : null;
}

/**
 * Условие ленты по линии (VED-596): посты выбранной линии (или любой линии
 * группы — `group:gaudiya_math`) плюс посты «для всех» (`null`). Пустое,
 * `all` или мусор — фильтра нет, `null`. Разбор значения общий с
 * Образованием и Медиатекой (`lineageFilterIds`), условие Prisma — своё.
 */
export function blogLineageWhere(
  filter: unknown,
): Prisma.BlogPostWhereInput | null {
  const ids = lineageFilterIds(filter);
  if (!ids) return null;
  const match: Prisma.BlogPostWhereInput =
    ids.length === 1 ? { lineage: ids[0] } : { lineage: { in: ids } };
  return { OR: [match, { lineage: null }] };
}

/** Фильтры читателя из адреса ленты. */
export interface BlogFeedFilters {
  category?: string;
  lineage?: string;
}

/**
 * Все условия фильтров списком — их складывают через `AND` с базовым
 * условием ленты: у того своё `OR` (срок в ленте), и слить их в один объект
 * значило бы затереть одно другим.
 */
export function blogFilterConditions(
  filters: BlogFeedFilters,
): Prisma.BlogPostWhereInput[] {
  const conditions: Prisma.BlogPostWhereInput[] = [];
  const category = blogCategoryWhere(filters.category);
  if (category) conditions.push(category);
  const lineage = blogLineageWhere(filters.lineage);
  if (lineage) conditions.push(lineage);
  return conditions;
}

/** Базовое условие, фильтры и курсор — одним `where`. */
export function combineBlogWhere(
  base: Prisma.BlogPostWhereInput,
  extra: Prisma.BlogPostWhereInput[],
): Prisma.BlogPostWhereInput {
  return extra.length === 0 ? base : { AND: [base, ...extra] };
}
