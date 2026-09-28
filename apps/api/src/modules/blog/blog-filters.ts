import type { Prisma } from '@prisma/client';
import {
  AUDIENCE_STAGES,
  LINEAGE_ALL,
  isBlogPostCategory,
  parseAudienceStages,
  isLineageId,
  lineageFilterIds,
  type BlogPostCategory,
  type LineageId,
  type SpiritualStage,
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

/**
 * Ступени самоидентификации поста (VED-590) из формы, тела запроса или
 * кнопки. «Для всех» — явный вариант `'all'`, как у линии; все четыре
 * ступени — то же «для всех» и хранятся пустым массивом.
 *
 * - `undefined` — поля нет: при правке ступени прежние;
 * - `'required'` — `null`, пустая строка или пустой список: не выбрали;
 * - `[]` — для всех; иначе ступени в порядке пути или `'invalid'`.
 *
 * Multipart присылает одно значение строкой, а несколько — массивом, поэтому
 * одиночная строка читается как список из одной ступени.
 */
export function blogAudienceStagesChoice(
  value: unknown,
): SpiritualStage[] | undefined | 'required' | 'invalid' {
  if (value === undefined) return undefined;
  if (value === null || value === '') return 'required';
  if (value === LINEAGE_ALL) return [];
  const list = typeof value === 'string' ? [value] : value;
  if (Array.isArray(list) && list.length === 0) return 'required';
  // «Для всех» в списке вместе со ступенями — противоречие, а не выбор.
  if (Array.isArray(list) && list.length === 1 && list[0] === LINEAGE_ALL) {
    return [];
  }
  const stages = parseAudienceStages(list);
  if (!stages) return 'invalid';
  return stages.length === AUDIENCE_STAGES.length ? [] : stages;
}

/** Категория, линия и ступени поста из тела публикации или правки. */
export interface BlogPostMarks {
  category?: BlogPostCategory;
  lineage?: LineageId | null;
  audienceStages?: SpiritualStage[];
}

export type BlogPostMarksError =
  | 'category_required'
  | 'invalid_category'
  | 'lineage_required'
  | 'invalid_lineage'
  | 'audience_stages_required'
  | 'invalid_audience_stages';

/**
 * Категория и линия из тела публикации или правки (VED-590).
 *
 * Поле, которое передали, обязано быть выбором: пустое (`null`, пустая
 * строка из multipart) — 400 `category_required` / `lineage_required`,
 * мусор — `invalid_*`. Поле, которого в запросе нет вовсе, — «как было»:
 * при правке значение прежнее, при публикации категории нет, а линия
 * «для всех» (`null`).
 *
 * Отсутствие не отвергается даже при публикации — ради обратной
 * совместимости: установленные сборки приложения до обновления публикуют
 * пост без этих полей, и 400 оставил бы их без публикации вовсе.
 * Обязательность держит веб-форма: она всегда шлёт оба поля («для всех» —
 * `'all'`). Когда приложение догонит, отсутствие при публикации можно
 * сделать ошибкой. Репост сюда не заходит — у него своих полей нет.
 */
export function blogPostMarksInput(
  body:
    | { category?: unknown; lineage?: unknown; audienceStages?: unknown }
    | null
    | undefined,
): BlogPostMarks | { error: BlogPostMarksError } {
  const category = blogCategoryChoice(body?.category);
  if (category === 'invalid') return { error: 'invalid_category' };
  if (category === 'required') return { error: 'category_required' };
  const lineage = blogLineageChoice(body?.lineage);
  if (lineage === 'invalid') return { error: 'invalid_lineage' };
  if (lineage === 'required') return { error: 'lineage_required' };
  const audienceStages = blogAudienceStagesChoice(body?.audienceStages);
  if (audienceStages === 'invalid') return { error: 'invalid_audience_stages' };
  if (audienceStages === 'required') {
    return { error: 'audience_stages_required' };
  }
  const marks: BlogPostMarks = {};
  if (category) marks.category = category;
  if (lineage !== undefined) marks.lineage = lineage;
  if (audienceStages !== undefined) marks.audienceStages = audienceStages;
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

/**
 * Поля `User`, из которых собираются «Фильтры материалов» зрителя (VED-617):
 * ручной выбор, анкета и прежний переключатель «Все ступени». Портальная
 * модель, только чтение; копия выборки Образования — модуль не импортирует
 * чужие (контракт сервисов).
 */
export const BLOG_VIEWER_FILTERS_SELECT = {
  spiritualStage: true,
  lineage: true,
  showAllStages: true,
  materialFiltersSetAt: true,
  materialStages: true,
  materialLineages: true,
} as const satisfies Prisma.UserSelect;

/**
 * Условие ленты по ступеням зрителя (VED-590) — то же правило, что в
 * Образовании и Медиатеке: посты его ступеней и посты для всех (пустой
 * массив). Свои посты автор видит всегда: пост, пропавший из ленты сразу
 * после публикации, выглядит потерянным. `null` у ступеней — фильтра нет
 * (выбраны все ступени, нет самоидентификации).
 */
export function blogAudienceStagesWhere(
  stages: readonly SpiritualStage[] | null,
  viewerId: string,
): Prisma.BlogPostWhereInput | null {
  if (!stages?.length) return null;
  return {
    OR: [
      { audienceStages: { isEmpty: true } },
      stages.length === 1
        ? { audienceStages: { has: stages[0] } }
        : { audienceStages: { hasSome: [...stages] } },
      { authorId: viewerId },
    ],
  };
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
