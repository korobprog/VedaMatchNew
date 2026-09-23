import {
  LINEAGE_ALL,
  LINEAGES,
  resolveContentLineage,
  type LineageId,
  type LineagePreference,
  type LineageViewer,
} from "@vedamatch/shared";

/**
 * Логика ряда кнопок-фильтров по духовной линии в Образовании (VED-395).
 * Разметка — в `lineage-filter-chips.tsx`, здесь только арифметика.
 *
 * Фильтр идёт по линии самого материала (`LibraryEntry.lineage`, её ставит
 * автор или редактор), а не по линии автора: автор-преданный ISKCON вправе
 * выложить лекцию Сарасват Матха. Справочник линий — `LINEAGES` из
 * `@vedamatch/shared`, свой список сервис не заводит.
 */

/** Кнопка ряда: одна линия или «все линии». */
export type LineageChoice = LineageId | typeof LINEAGE_ALL;

export interface LineageFilterOption {
  value: LineageChoice;
  /** Подпись на кнопке — короткое название линии. */
  label: string;
  /** Полное название с расшифровкой — для подсказки и скринридера. */
  title: string;
}

/**
 * Кнопки по порядку справочника: сначала «все линии», дальше ISKCON, матхи и
 * паривары — тот же порядок, что в выборе линии в профиле.
 */
export function lineageFilterOptions(allLabel: string): LineageFilterOption[] {
  return [
    { value: LINEAGE_ALL, label: allLabel, title: allLabel },
    ...LINEAGES.map((item) => ({
      value: item.id,
      label: item.shortLabel,
      title: item.hint ? `${item.label} — ${item.hint}` : item.label,
    })),
  ];
}

/** Какая кнопка нажата: применённая линия, а без фильтра — «все линии». */
export function activeLineageChoice(applied: LineageId | null): LineageChoice {
  return applied ?? LINEAGE_ALL;
}

/**
 * Что записать в настройку Образования по нажатию кнопки.
 *
 * Если нажатое совпадает с тем, что человек видит и без настройки (своя линия
 * у преданного, «все» у остальных), настройка сбрасывается в «как в профиле»
 * (`null`), а не закрепляет линию намертво. Иначе преданный, однажды нажавший
 * свою же линию, перестал бы следовать за профилем: сменил линию в профиле — а
 * Образование по-прежнему показывает старую.
 */
export function preferenceForChoice(
  viewer: LineageViewer | null,
  choice: LineageChoice,
): LineagePreference {
  const byProfile = resolveContentLineage(viewer, null);
  const wanted = choice === LINEAGE_ALL ? null : choice;
  return byProfile === wanted ? null : choice;
}

/**
 * Адрес страницы после смены фильтра: без `?lineage=` и без курсора ленты.
 *
 * `?lineage=` в адресе сильнее настройки — его ставит ссылка «показать все
 * линии» под пустой лентой. Останься он в адресе, нажатая кнопка сохранила
 * бы настройку, а лента продолжила бы показывать всё. Курсор принадлежит
 * прежней выдаче и в новой указывает в никуда.
 */
export function hrefWithoutLineage(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  params.delete("lineage");
  params.delete("cursor");
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
