import {
  LINEAGE_ALL,
  LINEAGE_GROUP_LABELS,
  LINEAGES,
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

/**
 * Меню кнопки «Фильтры» (VED-449): вместо ряда из одиннадцати кнопок — одна
 * кнопка и четыре пункта: «Всё», ISKCON, «Гаудия-матх», «Паривары». Группа
 * из одной линии (ISKCON) — сразу выбор; группа из нескольких раскрывается,
 * и линия выбирается внутри неё. Группой целиком API не фильтрует — только
 * по одной линии, поэтому у раскрывающегося пункта своего выбора нет.
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
}): LineageMenuItem[] {
  const [all, ...lineages] = lineageFilterOptions(labels.all);
  const items: LineageMenuItem[] = [{ kind: "choice", option: all }];
  for (const group of Object.keys(LINEAGE_GROUP_LABELS) as LineageGroup[]) {
    const options = lineages.filter(
      (option) =>
        LINEAGES.find((item) => item.id === option.value)?.group === group,
    );
    if (options.length === 0) continue;
    items.push(
      options.length === 1
        ? {
            kind: "choice",
            option: { ...options[0], label: labels.groups[group] },
          }
        : { kind: "group", group, label: labels.groups[group], options },
    );
  }
  return items;
}

/** Группа, в которой лежит выбранная линия, — её меню раскрывает сразу. */
export function lineageChoiceGroup(choice: LineageChoice): LineageGroup | null {
  if (choice === LINEAGE_ALL) return null;
  return LINEAGES.find((item) => item.id === choice)?.group ?? null;
}

/** Какая кнопка нажата: применённая линия, а без фильтра — «все линии». */
export function activeLineageChoice(applied: LineageId | null): LineageChoice {
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
