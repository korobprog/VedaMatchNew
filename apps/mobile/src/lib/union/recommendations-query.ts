import type { UnionRecommendation, UnionRecommendationFilters } from '@vedamatch/shared';

/**
 * Выдача Знакомств: адрес запроса, подгрузка страниц и пустой экран.
 *
 * На сайте фильтры живут в адресе страницы (`?intentions=family&page=2`), в
 * приложении адреса нет — фильтры держит экран объектом
 * `UnionRecommendationFilters` из общего пакета, а сюда он приходит, чтобы
 * стать строкой запроса. Правила склейки те же, что у сайта
 * (`toQueryString` в `apps/web/src/lib/union-api.ts`).
 */

/**
 * Размер порции. На сайте выбор 12/24/48 (`page-size.ts`) нужен из-за
 * постраничного перелистывания; в приложении страницы подгружаются сами при
 * прокрутке, и выбирать нечего. 24 — середина: сетка в две и в три колонки
 * заканчивается ровным рядом, а первая порция не заставляет ждать.
 */
export const UNION_PAGE_SIZE = 24;

/**
 * Строка запроса. Цели — повторяющимся параметром: сервер читает
 * `intentions` массивом (`union-recommendations.controller.ts`), а `set`
 * оставил бы одну. Ложные флаги и пустые строки не отправляются вовсе —
 * сервер понимает отсутствие как «не задано», и так адрес короче.
 */
export function recommendationsQuery(filters: UnionRecommendationFilters): string {
  const query: string[] = [];
  const add = (key: string, value: string) => query.push(`${key}=${encodeURIComponent(value)}`);
  for (const [key, value] of Object.entries(filters) as [string, unknown][]) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    if (Array.isArray(value)) {
      for (const item of value) if (item) add(key, String(item));
    } else if (value === true) {
      add(key, 'true');
    } else if (typeof value === 'number') {
      if (Number.isFinite(value)) add(key, String(value));
    } else {
      add(key, String(value));
    }
  }
  return query.length > 0 ? `?${query.join('&')}` : '';
}

/**
 * Склейка подгруженной страницы с уже показанными. Пока человек листал,
 * выдача на сервере сдвинулась (кто-то ответил, кто-то включил «Внимание»),
 * и анкета с первой страницы может приехать снова на второй — дважды в
 * сетке ей не место: у плитки ключ по id, повтор уронил бы список.
 */
export function mergeRecommendationPages(
  shown: readonly UnionRecommendation[],
  page: readonly UnionRecommendation[],
): UnionRecommendation[] {
  const seen = new Set(shown.map((item) => item.user.id));
  return [...shown, ...page.filter((item) => !seen.has(item.user.id))];
}

/** Условия, которые выдачу расширяют, а не сужают: сбрасывать их бессмысленно. */
const WIDENING: ReadonlySet<keyof UnionRecommendationFilters> = new Set(['includeSwiped', 'showAll']);

/** Служебное, а не фильтр: страница, размер, порядок. */
const NOT_FILTERS: ReadonlySet<keyof UnionRecommendationFilters> = new Set(['page', 'pageSize', 'sort']);

function isSet(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && value !== '' && value !== false;
}

/** Сколько условий реально сужает выдачу — для «Сбросить фильтры» на пустом экране. */
export function countNarrowingFilters(filters: UnionRecommendationFilters): number {
  return (Object.keys(filters) as (keyof UnionRecommendationFilters)[]).filter(
    (key) => !WIDENING.has(key) && !NOT_FILTERS.has(key) && isSet(filters[key]),
  ).length;
}

/** Что предложить на пустой выдаче — перенос `recommendation-empty-state.ts`. */
export interface EmptyStateActions {
  /** Сколько подходящих анкет скрыто историей показов; `null` — предлагать нечего. */
  viewedToShow: number | null;
  /** Есть что сбрасывать: хотя бы одно сужающее условие. */
  canResetFilters: boolean;
  /** Ни одно действие не поможет — людей действительно нет. */
  nothingHelps: boolean;
}

/**
 * Пустая выдача бывает по трём причинам, и действие у каждой своё. Диагноз
 * ставится по фактам, а на экран попадает только то, что реально изменит
 * выдачу. «Стереть решения и заявки» сюда намеренно не попадает: оно
 * необратимо отменяет неотвеченные заявки.
 */
export function emptyStateActions({
  narrowingFilterCount,
  includeSwiped,
  viewedMatchCount,
}: {
  narrowingFilterCount: number;
  includeSwiped: boolean;
  viewedMatchCount: number;
}): EmptyStateActions {
  const viewedToShow = !includeSwiped && viewedMatchCount > 0 ? viewedMatchCount : null;
  const canResetFilters = narrowingFilterCount > 0;
  return { viewedToShow, canResetFilters, nothingHelps: viewedToShow === null && !canResetFilters };
}

/**
 * «Показать вообще всех» — аварийный выход: снимает и историю показов, и
 * молча сужающее (возраст из анкеты, пол под целью «Создание семьи»).
 * Единственный запрос, после которого выдача гарантированно не пуста, если
 * на портале вообще есть анкеты (`EVERYTHING_URL` на сайте).
 */
export const EVERYTHING_FILTERS: UnionRecommendationFilters = { showAll: true };

/**
 * Две колонки — крупные лица, три — вдвое больше людей за экран. Что важнее,
 * зависит от человека, поэтому выбор его и запоминается (`grid-density.ts`).
 */
export type GridDensity = 2 | 3;

export const DEFAULT_DENSITY: GridDensity = 2;

export function nextDensity(current: GridDensity): GridDensity {
  return current === 2 ? 3 : 2;
}

/** Чужое или испорченное сохранённое значение не должно ломать сетку. */
export function parseDensity(raw: string | null | undefined): GridDensity {
  return raw === '3' ? 3 : DEFAULT_DENSITY;
}

/** Подпись обещает результат нажатия, а не текущее состояние. */
export function densityLabel(density: GridDensity): string {
  return density === 3 ? 'Крупнее' : 'Плотнее';
}

/** Ширина плитки: экран минус поля и зазоры, поровну на колонки. */
export function tileSize(screenWidth: number, density: GridDensity, padding: number, gap: number): number {
  const inner = screenWidth - padding * 2 - gap * (density - 1);
  return Math.max(0, Math.floor(inner / density));
}
