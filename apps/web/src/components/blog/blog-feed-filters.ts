import {
  BLOG_POST_CATEGORIES,
  BLOG_POST_CATEGORY_LABELS,
  isBlogPostCategory,
  isLineageFilterValue,
  lineageFilterLabel,
  type BlogPostCategory,
  type LineageFilterValue,
} from "@vedamatch/shared";

/**
 * Фильтры Блог-ленты (VED-590, VED-596): категория и духовная линия.
 * Выбор живёт в адресе (`?category=`, `?lineage=`), как тип и язык на
 * странице автора Образования: ссылку на отфильтрованную ленту можно
 * переслать, а «назад» возвращает прежний выбор. Разметка — в
 * `blog-feed-filter-menus.tsx`, здесь только арифметика.
 */

export interface BlogFeedFilterValues {
  category: BlogPostCategory | null;
  lineage: LineageFilterValue | null;
  /** Поиск по содержанию (VED-687). */
  q?: string | null;
  /** Поиск по автору (VED-687). */
  author?: string | null;
}

/** Строка поиска из адреса: без лишних пробелов, не длиннее ста знаков. */
function searchValue(value: string | undefined): string | null {
  const term = value?.trim().replace(/\s+/g, " ").slice(0, 100) ?? "";
  return term.length >= 2 ? term : null;
}

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Адрес → фильтры. Мусор читается как «без фильтра», а не как пустая лента. */
export function parseBlogFeedFilters(
  params: SearchParams,
): BlogFeedFilterValues {
  const category = first(params.category);
  const lineage = first(params.lineage);
  // Поиск — только когда задан: без него фильтры ровно те же, что раньше.
  const q = searchValue(first(params.q));
  const author = searchValue(first(params.author));
  return {
    category: isBlogPostCategory(category) ? category : null,
    lineage: isLineageFilterValue(lineage) ? lineage : null,
    ...(q ? { q } : {}),
    ...(author ? { author } : {}),
  };
}

/**
 * Адрес ленты с другим значением фильтра. Остальные параметры (`view` —
 * вкладка «Избранное», второй фильтр) сохраняются; `null` снимает фильтр,
 * курсор и `new` (раскрытая форма) не переносятся — это не выбор человека.
 */
export function blogFeedHref(
  pathname: string,
  search: string,
  patch: {
    category?: string | null;
    lineage?: string | null;
    q?: string | null;
    author?: string | null;
  },
): string {
  const next = new URLSearchParams(search);
  next.delete("cursor");
  next.delete("new");
  for (const key of ["category", "lineage", "q", "author"] as const) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (value) next.set(key, value);
    else next.delete(key);
  }
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export interface BlogCategoryOption {
  /** `""` — «Все» в фильтре. */
  value: BlogPostCategory | "";
  label: string;
}

/** Меню фильтра: «Все», затем категории в порядке карточки заказчика. */
export function blogCategoryFilterOptions(): BlogCategoryOption[] {
  return [
    { value: "", label: "Все" },
    ...BLOG_POST_CATEGORIES.map((value) => ({
      value,
      label: BLOG_POST_CATEGORY_LABELS[value],
    })),
  ];
}

/**
 * Выбор категории поста — только категории. «Без категории» больше нет:
 * пост без неё не публикуется, и снять её потом нельзя (VED-590).
 */
export function blogCategoryAssignOptions(): BlogCategoryOption[] {
  return BLOG_POST_CATEGORIES.map((value) => ({
    value,
    label: BLOG_POST_CATEGORY_LABELS[value],
  }));
}

/** Подпись категории поста; `null` — без категории. */
export function blogCategoryLabel(
  category: string | null | undefined,
): string | null {
  return isBlogPostCategory(category)
    ? BLOG_POST_CATEGORY_LABELS[category]
    : null;
}

/**
 * Имя кнопки фильтра для скринридера и подсказки — сразу с текущим выбором,
 * чтобы не открывать меню ради «что стоит сейчас».
 */
export function blogCategoryFilterLabel(
  category: BlogPostCategory | null,
): string {
  return `Категории постов: ${blogCategoryLabel(category) ?? "все"}`;
}

export function blogLineageFilterLabel(
  lineage: LineageFilterValue | null,
): string {
  return `Фильтр по организациям: ${lineageFilterLabel(lineage) ?? "все линии"}`;
}

/** Имя кнопки «Назначить категорию» у поста. */
export function blogCategoryAssignLabel(
  category: BlogPostCategory | null | undefined,
): string {
  return `Назначить категорию: ${blogCategoryLabel(category) ?? "без категории"}`;
}
