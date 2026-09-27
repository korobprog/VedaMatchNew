import {
  lineageOption,
  lineagesByGroup,
  type LineageId,
} from "@vedamatch/shared";

/**
 * Меню «Линия» у материала (VED-561): выбор ISKCON, матха, паривара или
 * «без линии». Логика отдельно от кнопки — её проверяют тесты без DOM.
 */

/** Подпись варианта «без линии»: материал виден преданным всех линий. */
export const LINEAGE_MENU_NONE = "Без линии — для всех";

export interface LineageMenuOption {
  value: LineageId | null;
  label: string;
}

export interface LineageMenuGroup {
  /** Ключ для React и подпись группы; у «без линии» подписи нет. */
  key: string;
  label: string | null;
  options: LineageMenuOption[];
}

/** «Без линии» первым, затем ISKCON, Гаудия-матх и Паривары по справочнику. */
export function lineageMenuGroups(): LineageMenuGroup[] {
  return [
    {
      key: "none",
      label: null,
      options: [{ value: null, label: LINEAGE_MENU_NONE }],
    },
    ...lineagesByGroup().map((group) => ({
      key: group.group,
      label: group.label,
      options: group.items.map((item) => ({
        value: item.id,
        label: item.label,
      })),
    })),
  ];
}

/**
 * Подпись кнопки для скринридера и подсказки: действие и текущее значение
 * сразу, чтобы не открывать меню ради «что стоит сейчас».
 */
export function lineageButtonLabel(value: LineageId | null): string {
  const option = lineageOption(value);
  return `Линия: ${option ? option.label : "для всех линий"}`;
}
