import type { Prisma } from '@prisma/client';
import {
  LINEAGE_ALL,
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
 * Линия поста из кнопки «Разметка» / «Линия» (VED-596): идентификатор
 * справочника либо `null` — «для всех». «Для всех» приходит и явным
 * `'all'` — тем же значением, что в форме публикации. Всё остальное —
 * `'invalid'`, чтобы мусор из тела запроса отвечал 400, а не доезжал до базы.
 * Группа (`group:gaudiya_math`) посту не назначается: у поста, как у
 * материала Образования, линия всегда конкретная.
 */
export function blogLineageInput(value: unknown): LineageId | null | 'invalid' {
  if (value === null || value === undefined || value === '') return null;
  if (value === LINEAGE_ALL) return null;
  return isLineageId(value) ? value : 'invalid';
}

/**
 * Категория поста из формы или кнопки (VED-590).
 *
 * - `undefined` — поля в запросе нет: при правке категория прежняя;
 * - `'required'` — поле очистили (`null`, пустая строка из multipart). Пост
 *   без категории больше не публикуется, и снять её после нельзя;
 * - `'invalid'` — не из списка, запрос отвечает 400.
 */
export function blogCategoryChoice(
  value: unknown,
): BlogPostCategory | undefined | 'required' | 'invalid' {
  if (value === undefined) return undefined;
  if (value === null || value === '') return 'required';
  return isBlogPostCategory(value) ? value : 'invalid';
}

/**
 * Линия поста из формы публикации и правки (VED-590). «Для всех» — не
 * пустота, а явный вариант `'all'`: заказчик хочет, чтобы и он был
 * осознанным выбором. В базе «для всех» — `null`, как у постов до линий:
 * фильтр ленты и так показывает их всем.
 *
 * - `undefined` — поля нет: при правке линия прежняя;
 * - `'required'` — `null` или пустая строка: не выбрали;
 * - `null` — «для всех»; иначе идентификатор справочника или `'invalid'`.
 */
export function blogLineageChoice(
  value: unknown,
): LineageId | null | undefined | 'required' | 'invalid' {
  if (value === undefined) return undefined;
  if (value === null || value === '') return 'required';
  if (value === LINEAGE_ALL) return null;
  return isLineageId(value) ? value : 'invalid';
}

/** Категория и линия поста, разобранные из тела публикации или правки. */
export interface BlogPostMarks {
  category?: BlogPostCategory;
  lineage?: LineageId | null;
}

export type BlogPostMarksError =
  | 'category_required'
  | 'invalid_category'
  | 'lineage_required'
  | 'invalid_lineage';

/**
 * Пост нельзя опубликовать, не назначив категорию и линию (VED-590). При
 * публикации оба поля обязательны. При правке молчание — «как было»:
 * старые посты и клиенты, которые полей не шлют, правятся как раньше, а
 * очистить поле нельзя. Репост сюда не заходит — у него своих полей нет.
 */
export function blogPostMarksInput(
  body: { category?: unknown; lineage?: unknown } | null | undefined,
  mode: 'create' | 'update',
): BlogPostMarks | { error: BlogPostMarksError } {
  const category = blogCategoryChoice(body?.category);
  if (category === 'invalid') return { error: 'invalid_category' };
  if (category === 'required' || (mode === 'create' && !category)) {
    return { error: 'category_required' };
  }
  const lineage = blogLineageChoice(body?.lineage);
  if (lineage === 'invalid') return { error: 'invalid_lineage' };
  if (lineage === 'required' || (mode === 'create' && lineage === undefined)) {
    return { error: 'lineage_required' };
  }
  const marks: BlogPostMarks = {};
  if (category) marks.category = category;
  if (lineage !== undefined) marks.lineage = lineage;
  return marks;
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
