import {
  LINEAGE_ALL,
  LINEAGE_GROUP_DETAIL_PROMPTS,
  LINEAGE_GROUP_LABELS,
  LINEAGE_GROUPS,
  isLineageGroup,
  lineageGroupFilter,
  lineageGroupFromFilter,
  lineageGroupOf,
  lineagesOfGroup,
  soleLineageOfGroup,
  type LineageGroup,
} from "@vedamatch/shared";

/**
 * Выбор линии в два шага (VED-568): сначала группа — ISKCON, Гаудия-матх,
 * Паривары, затем, если в группе больше одной линии, какая именно. Одна
 * логика для выпадающих списков (`LineageSelect`), карточек выбора
 * (`LineageCards`) и меню (`LineageMenuButton`, фильтр Образования), чтобы
 * админ, задающий линию, и читатель, фильтрующий по ней, видели одно и то же
 * устройство. Разметка — в компонентах, здесь только арифметика.
 *
 * Значение поля — строка, как и раньше: `""` (не выбрано / как в профиле),
 * `"all"`, идентификатор линии либо — только в фильтрах — `group:<группа>`.
 */

/** Группа, к которой относится значение поля; `null` — пусто или «все». */
export function lineageValueGroup(value: string): LineageGroup | null {
  return lineageGroupOf(value) ?? lineageGroupFromFilter(value);
}

/**
 * Что стоит в первом шаге: `""`, `"all"` или идентификатор группы. Группа,
 * выбранная на первом шаге, но ещё без линии (`pending`), сильнее значения:
 * человек видит свой выбор, пока не закончил второй шаг.
 */
export function lineageFirstStepValue(
  value: string,
  pending: LineageGroup | null,
): string {
  if (pending) return pending;
  if (value === "" || value === LINEAGE_ALL) return value;
  return lineageValueGroup(value) ?? "";
}

/** Нужен ли группе второй шаг: в ней больше одной линии. */
export function lineageGroupHasDetail(group: LineageGroup): boolean {
  return soleLineageOfGroup(group) === null;
}

/**
 * Что сделать, когда на первом шаге выбрали пункт.
 *
 * - `""`, `"all"` и группа из одной линии (ISKCON) — готовое значение;
 * - группа из нескольких линий в фильтре (`allowGroup`) — вся группа, а
 *   конкретную линию можно уточнить вторым шагом;
 * - в остальных местах (линия материала, профиля) хранится конкретная
 *   линия, поэтому группа только раскрывает второй шаг: значение не
 *   меняется, пока не выбрана линия. Если группа уже та же, что у значения,
 *   ждать нечего — линия уже выбрана.
 */
export function lineageFirstStepPick(
  picked: string,
  current: string,
  allowGroup: boolean,
): { value: string } | { pending: LineageGroup } | null {
  if (!isLineageGroup(picked)) return { value: picked };
  const sole = soleLineageOfGroup(picked);
  if (sole) return { value: sole };
  if (allowGroup) return { value: lineageGroupFilter(picked) };
  if (lineageValueGroup(current) === picked) return null;
  return { pending: picked };
}

export interface LineageStepOption {
  value: string;
  label: string;
  /** Полное название с расшифровкой — для подсказки и скринридера. */
  title: string;
}

/**
 * Пункты первого шага: группы по порядку справочника. У группы из одной
 * линии подпись — сама линия (ISKCON с расшифровкой), и надпись «ISKCON» в
 * списке одна, а не заголовок группы плюс строка под ним (VED-568).
 */
export function lineageGroupOptions(compact = false): LineageStepOption[] {
  return LINEAGE_GROUPS.map((group) => {
    const sole = lineagesOfGroup(group);
    const item = sole.length === 1 ? sole[0] : null;
    const full = item?.hint
      ? `${item.label} — ${item.hint}`
      : LINEAGE_GROUP_LABELS[group];
    return {
      value: group,
      label: compact ? LINEAGE_GROUP_LABELS[group] : full,
      title: full,
    };
  });
}

/** Подпись пункта «вся группа» во втором шаге фильтра. */
export const LINEAGE_GROUP_ANY_LABELS: Record<LineageGroup, string> = {
  iskcon: "ISKCON",
  gaudiya_math: "Любой Гаудия-матх",
  parivara: "Любой паривар",
};

/**
 * Пункты второго шага — линии группы; в фильтре первым идёт «вся группа».
 */
export function lineageDetailOptions(
  group: LineageGroup,
  { allowGroup = false, compact = false } = {},
): LineageStepOption[] {
  const items = lineagesOfGroup(group).map((item) => {
    const full = item.hint ? `${item.label} — ${item.hint}` : item.label;
    return {
      value: item.id as string,
      label: compact ? item.shortLabel : full,
      title: full,
    };
  });
  if (!allowGroup) return items;
  const any = LINEAGE_GROUP_ANY_LABELS[group];
  return [
    { value: lineageGroupFilter(group), label: any, title: any },
    ...items,
  ];
}

/** Как спросить второй шаг: «Какой именно матх». */
export function lineageDetailPrompt(group: LineageGroup): string {
  return LINEAGE_GROUP_DETAIL_PROMPTS[group];
}
