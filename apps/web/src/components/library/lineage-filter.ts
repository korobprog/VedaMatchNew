import {
  LINEAGE_ALL,
  LINEAGE_GROUPS,
  LINEAGES,
  lineageGroupFilter,
  lineageGroupFromFilter,
  lineageGroupOf,
  type LineageFilterValue,
  type LineageGroup,
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

/** Кнопка ряда: одна линия, вся группа (VED-568) или «все линии». */
export type LineageChoice = LineageFilterValue | typeof LINEAGE_ALL;

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
 * из одной линии (ISKCON) — сразу выбор; группа из нескольких раскрывается,
 * и внутри неё первым пунктом — вся группа (`group:gaudiya_math`, VED-568),
 * дальше линии по одной.
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
  groups: Record<LineageGroup, string>;
  /** Пункт «вся группа» внутри раскрывающейся группы. */
  anyInGroup?: Partial<Record<LineageGroup, string>>;
}): LineageMenuItem[] {
  const [all, ...lineages] = lineageFilterOptions(labels.all);
  const items: LineageMenuItem[] = [{ kind: "choice", option: all }];
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
    const anyLabel = labels.anyInGroup?.[group] ?? labels.groups[group];
    items.push({
      kind: "group",
      group,
      label: labels.groups[group],
      options: [
        { value: lineageGroupFilter(group), label: anyLabel, title: anyLabel },
        ...options,
      ],
    });
  }
  return items;
}

/** Группа выбранной линии или группы — её меню раскрывает сразу. */
export function lineageChoiceGroup(choice: LineageChoice): LineageGroup | null {
  if (choice === LINEAGE_ALL) return null;
  return lineageGroupOf(choice) ?? lineageGroupFromFilter(choice);
}

/** Какая кнопка нажата: применённый фильтр, а без фильтра — «все линии». */
export function activeLineageChoice(
  applied: LineageFilterValue | null,
): LineageChoice {
  return applied ?? LINEAGE_ALL;
}

/**
 * Что записать в настройку Образования по нажатию кнопки.
 *
 * Без настройки Образование показывает «Все» (VED-483): линия из профиля
 * фильтр сама не включает. Поэтому «Все» — это пустая настройка, а линия —
 * явная, и держится во всём Образовании, пока человек её не сменит.
 */
export function preferenceForChoice(choice: LineageChoice): LineagePreference {
  return choice === LINEAGE_ALL ? null : choice;
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
