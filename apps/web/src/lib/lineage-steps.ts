import {
  LINEAGE_ALL,
  LINEAGE_GROUP_DETAIL_PROMPTS,
  LINEAGE_GROUP_LABELS,
  LINEAGE_GROUPS,
  isLineageGroup,
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
 * `"all"` или идентификатор линии. Пункта «вся группа» («Любой Гаудия-матх»)
 * нет — заказчик убрал его (VED-568), но значение `group:<группа>`, уже
 * сохранённое в фильтре раньше, по-прежнему понимается: первый шаг
 * показывает его группу, второй — ждёт уточнения.
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
 * - группа из нескольких линий только раскрывает второй шаг: значение не
 *   меняется, пока не выбрана линия. Выбрать группу целиком нельзя ни в
 *   линии материала, ни в фильтре (VED-568). Если у значения уже линия
 *   этой группы, ждать нечего — линия уже выбрана.
 */
export function lineageFirstStepPick(
  picked: string,
  current: string,
): { value: string } | { pending: LineageGroup } | null {
  if (!isLineageGroup(picked)) return { value: picked };
  const sole = soleLineageOfGroup(picked);
  if (sole) return { value: sole };
  if (lineageGroupOf(current) === picked) return null;
  return { pending: picked };
}

/**
 * Что стоит во втором шаге: линия значения либо `""` — «ещё не уточнено».
 * Пусто и пока группа только выбрана (`pending`), и у сохранённой раньше
 * группы целиком (`group:<группа>`): такого пункта в списке больше нет.
 */
export function lineageDetailValue(
  value: string,
  pending: LineageGroup | null,
): string {
  if (pending) return "";
  return lineageGroupOf(value) ? value : "";
}

export interface LineageStepOption {
  value: string;
  /**
   * Подпись пункта. Аббревиатура — без расшифровки (VED-634): «ISKCON»,
   * «IPBYS»; расшифровку показывает значок «?» рядом (`LineageLabel`).
   */
  label: string;
  /** Полное название с расшифровкой — для всплывающей подсказки. */
  title: string;
}

function withHint(label: string, hint: string | undefined): string {
  return hint ? `${label} — ${hint}` : label;
}

/**
 * Пункты первого шага: группы по порядку справочника. У группы из одной
 * линии подпись — сама линия (ISKCON), и надпись «ISKCON» в списке одна, а
 * не заголовок группы плюс строка под ним (VED-568).
 */
export function lineageGroupOptions(compact = false): LineageStepOption[] {
  return LINEAGE_GROUPS.map((group) => {
    const sole = lineagesOfGroup(group);
    const item = sole.length === 1 ? sole[0] : null;
    const label = item && !compact ? item.label : LINEAGE_GROUP_LABELS[group];
    return {
      value: group,
      label,
      title: withHint(label, item?.hint),
    };
  });
}

/** Пункты второго шага — линии группы, без пункта «вся группа» (VED-568). */
export function lineageDetailOptions(
  group: LineageGroup,
  { compact = false } = {},
): LineageStepOption[] {
  return lineagesOfGroup(group).map((item) => ({
    value: item.id as string,
    label: compact ? item.shortLabel : item.label,
    title: withHint(item.label, item.hint),
  }));
}

/** Как спросить второй шаг: «Какой именно матх». */
export function lineageDetailPrompt(group: LineageGroup): string {
  return LINEAGE_GROUP_DETAIL_PROMPTS[group];
}
