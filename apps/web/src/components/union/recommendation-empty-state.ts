/**
 * Ключ хранит только возрастной фильтр — остальные фильтры живут в URL и
 * сами переживают навигацию через defaultValue из searchParams. Лежит
 * здесь, а не в форме фильтров: «Сбросить» есть и на пустом экране, и
 * очистить localStorage должны обе кнопки одинаково.
 */
export const AGE_STORAGE_KEY = "union.recommendations.ageRange";

/**
 * Аварийный выход с пустой выдачи: ни одного условия и вместе с уже
 * отсмотренными. Это единственный адрес, после которого список гарантированно
 * не пуст, если на портале вообще есть анкеты.
 */
export const EVERYTHING_URL = "/union/recommendations?includeSwiped=true";

export const filterKeys = [
  "intentions",
  // Старая ссылка с `intention=` тоже должна зажигать бейдж на мобильном.
  "intention",
  "stage",
  "gender",
  "format",
  "country",
  "city",
  "radiusKm",
  "language",
  "ageMin",
  "ageMax",
  "diet",
  "principlesMin",
  "childrenStatus",
  "verifiedOnly",
  "photoVerifiedOnly",
  "includeSwiped",
] as const;

export function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function countActiveFilters(
  params: Record<string, string | string[] | undefined>,
): number {
  return filterKeys.filter((key) => Boolean(first(params[key]))).length;
}

/**
 * Сколько условий реально сужает выдачу. `includeSwiped` в счёт не идёт: он
 * выдачу расширяет, и сброс такого «фильтра» на пустом экране не помог бы, а
 * дал бы ещё меньше. Для бейджа на мобильном по-прежнему нужен полный счёт —
 * там это просто «настройка отличается от умолчания», см. countActiveFilters.
 */
export function countNarrowingFilters(
  params: Record<string, string | string[] | undefined>,
): number {
  return filterKeys.filter(
    (key) => key !== "includeSwiped" && Boolean(first(params[key])),
  ).length;
}

/** Что предложить нажать на пустой выдаче. */
export interface EmptyStateActions {
  /** Сколько подходящих анкет скрыто историей показов; `null` — предлагать нечего. */
  viewedToShow: number | null;
  /** Есть что сбрасывать: хотя бы один фильтр задан. */
  canResetFilters: boolean;
  /** Ни одно действие не поможет — людей действительно нет. */
  nothingHelps: boolean;
}

/**
 * Пустая выдача бывает по трём разным причинам, и действие у каждой своё.
 * Прежний экран перечислял все три текстом и заставлял пользователя ставить
 * диагноз самому. Здесь диагноз ставится по фактам, а на экран попадает
 * только то, что реально изменит выдачу.
 *
 * «Стереть решения и заявки» сюда намеренно не попадает: оно необратимо
 * отменяет ещё не отвеченные заявки, живёт в фильтрах под подтверждением и
 * не должно быть главной кнопкой экрана, куда попадают часто.
 */
export function emptyStateActions({
  narrowingFilterCount,
  includeSwiped,
  viewedMatchCount,
}: {
  /** Только сужающие условия — см. countNarrowingFilters. */
  narrowingFilterCount: number;
  includeSwiped: boolean;
  /** Сколько анкет нашлось бы, если бы история показов не скрывала их. */
  viewedMatchCount: number;
}): EmptyStateActions {
  // Когда отсмотренные уже показываются, повторное предложение ничего не даст.
  const viewedToShow =
    !includeSwiped && viewedMatchCount > 0 ? viewedMatchCount : null;
  const canResetFilters = narrowingFilterCount > 0;
  return {
    viewedToShow,
    canResetFilters,
    nothingHelps: viewedToShow === null && !canResetFilters,
  };
}

/** Ссылка на ту же выдачу, но с уже отсмотренными и с первой страницы. */
export function withIncludeSwiped(
  params: Record<string, string | string[] | undefined>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "page" || key === "includeSwiped" || key === "historyReset") {
      continue;
    }
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item) query.append(key, item);
    }
  }
  query.set("includeSwiped", "true");
  query.set("page", "1");
  return `/union/recommendations?${query.toString()}`;
}
