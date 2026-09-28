import {
  LINEAGE_GROUP_LABELS,
  LINEAGE_GROUPS,
  lineageFilterLabel,
  lineageGroupOf,
  lineagesOfGroup,
  type LineageGroup,
  type LineageId,
} from "@vedamatch/shared";

/**
 * Меню «Линия» у материала (VED-561): выбор ISKCON, матха, паривара или
 * «без линии». Логика отдельно от кнопки — её проверяют тесты без DOM.
 *
 * Устроено как выбор линии везде (VED-568): сначала группа, затем линия
 * внутри неё. ISKCON — одна линия, поэтому пункт один, без заголовка
 * группы над ним: раньше «ISKCON» стояло в меню дважды. Гаудия-матх и
 * Паривары — раскрывающиеся пункты с линиями внутри.
 */

/** Подпись варианта «без линии»: материал виден преданным всех линий. */
export const LINEAGE_MENU_NONE = "Без линии — для всех";

export interface LineageMenuOption {
  value: LineageId | null;
  label: string;
}

export type LineageMenuItem =
  | { kind: "choice"; option: LineageMenuOption }
  | {
      kind: "group";
      group: LineageGroup;
      label: string;
      options: LineageMenuOption[];
    };

/** «Без линии» первым, затем ISKCON, Гаудия-матх и Паривары по справочнику. */
export function lineageMenuItems(): LineageMenuItem[] {
  return [
    { kind: "choice", option: { value: null, label: LINEAGE_MENU_NONE } },
    ...LINEAGE_GROUPS.map((group): LineageMenuItem => {
      const options = lineagesOfGroup(group).map((item) => ({
        value: item.id,
        label: item.label,
      }));
      return options.length === 1
        ? {
            kind: "choice",
            option: { ...options[0], label: LINEAGE_GROUP_LABELS[group] },
          }
        : { kind: "group", group, label: LINEAGE_GROUP_LABELS[group], options };
    }),
  ];
}

/** Группа, раскрытая при открытии меню: та, где лежит текущая линия. */
export function lineageMenuOpenGroup(
  value: LineageId | null,
): LineageGroup | null {
  const group = lineageGroupOf(value);
  return group && lineagesOfGroup(group).length > 1 ? group : null;
}

/**
 * Подпись кнопки для скринридера и подсказки: действие и текущее значение
 * сразу, чтобы не открывать меню ради «что стоит сейчас».
 */
export function lineageButtonLabel(value: LineageId | null): string {
  return `Линия: ${lineageFilterLabel(value) ?? "для всех линий"}`;
}
