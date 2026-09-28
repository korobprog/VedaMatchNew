import {
  LINEAGE_ALL,
  LINEAGE_GROUPS,
  LINEAGES,
  lineageGroupFromFilter,
  lineageGroupOf,
  type LineageFilterValue,
  type LineageGroup,
  type LineageId,
  type LineagePreference,
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

/**
 * Кнопка ряда: одна линия или «все линии». Вся группа (`group:<группа>`) в
 * меню больше не предлагается (VED-568), но сохранённая раньше настройка
 * остаётся рабочей: API её понимает, а меню подсвечивает её группу.
 */
export type LineageChoice =
  LineageFilterValue | typeof LINEAGE_ALL | typeof LINEAGE_PORTAL;

/**
 * Пункт «Как в фильтрах материалов» (VED-617): настройки Образования нет, и
 * лента следует «Фильтрам материалов» с главной. Появляется, только когда
 * те сужают линии, — иначе он ничем не отличался бы от «Всё».
 */
export const LINEAGE_PORTAL = "portal" as const;

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

/**
 * Меню кнопки «Фильтры» (VED-449): вместо ряда из одиннадцати кнопок — одна
 * кнопка и четыре пункта: «Всё», ISKCON, «Гаудия-матх», «Паривары». Группа
 * из одной линии (ISKCON) — сразу выбор; группа из нескольких раскрывается
 * в свои линии. Пункта «Любой Гаудия-матх» нет — заказчик убрал его
 * (VED-568).
 */
export type LineageMenuItem =
  | { kind: "choice"; option: LineageFilterOption }
  | {
      kind: "group";
      group: LineageGroup;
      label: string;
      options: LineageFilterOption[];
    };

export function lineageFilterMenu(labels: {
  all: string;
  /** Подпись пункта «Как в фильтрах материалов»; без неё пункта нет. */
  portal?: string;
  groups: Record<LineageGroup, string>;
}): LineageMenuItem[] {
  const [all, ...lineages] = lineageFilterOptions(labels.all);
  const items: LineageMenuItem[] = [];
  if (labels.portal) {
    items.push({
      kind: "choice",
      option: {
        value: LINEAGE_PORTAL,
        label: labels.portal,
        title: labels.portal,
      },
    });
  }
  items.push({ kind: "choice", option: all });
  for (const group of LINEAGE_GROUPS) {
    const options = lineages.filter(
      (option) => lineageGroupOf(option.value) === group,
    );
    if (options.length === 0) continue;
    if (options.length === 1) {
      items.push({
        kind: "choice",
        option: { ...options[0], label: labels.groups[group] },
      });
      continue;
    }
    items.push({
      kind: "group",
      group,
      label: labels.groups[group],
      options,
    });
  }
  return items;
}

/**
 * Группа выбранной линии или сохранённой раньше группы целиком — её шапка в
 * меню подсвечена.
 */
export function lineageChoiceGroup(choice: LineageChoice): LineageGroup | null {
  if (choice === LINEAGE_ALL || choice === LINEAGE_PORTAL) return null;
  return lineageGroupOf(choice) ?? lineageGroupFromFilter(choice);
}

/**
 * Какой пункт меню нажат (VED-617): явный `?lineage=` в адресе, иначе
 * настройка Образования, а без неё — «Как в фильтрах материалов», если те
 * сужают линии, или «Всё».
 */
export function currentLineageChoice({
  explicit,
  preference,
  portalLineages,
}: {
  explicit: LineagePreference;
  preference: LineagePreference;
  portalLineages: readonly LineageId[];
}): LineageChoice {
  const chosen = explicit ?? preference;
  if (chosen) return chosen;
  return portalLineages.length ? LINEAGE_PORTAL : LINEAGE_ALL;
}

/**
 * Что записать в настройку Образования по нажатию кнопки.
 *
 * Пустая настройка — «как в фильтрах материалов» с главной (VED-617). Линия
 * — явная и держится во всём Образовании, пока человек её не сменит. «Всё»
 * пишется явным `all`, только когда фильтры материалов сужают линии: иначе
 * пустая настройка и так показывает всё, и незачем отрывать Образование от
 * фильтров.
 */
export function preferenceForChoice(
  choice: LineageChoice,
  portalLineages: readonly LineageId[] = [],
): LineagePreference {
  if (choice === LINEAGE_PORTAL) return null;
  if (choice === LINEAGE_ALL) return portalLineages.length ? LINEAGE_ALL : null;
  return choice;
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
