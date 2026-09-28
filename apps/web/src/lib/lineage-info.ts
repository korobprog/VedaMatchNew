import {
  lineageFilterLabel,
  lineageOption,
  type LineageId,
} from "@vedamatch/shared";

/**
 * Строки окна «Линия» с домиком (VED-616): к какой линии относится материал
 * и его автор. Логика без разметки — её проверяют тесты без DOM.
 */
export interface LineageInfoSubject {
  /** «Материал», «Запись», «Пост», «Автор», «Исполнитель». */
  title: string;
  lineage: LineageId | null;
  /**
   * Что сказать без линии. У материала это «Для всех линий» (осознанный
   * выбор редакции), у автора — «Не указана».
   */
  emptyLabel?: string;
}

export interface LineageInfoRow {
  title: string;
  /** «ISKCON», «Гаудия-матх — IPBYS» или подпись пустого значения. */
  value: string;
  /** Расшифровка аббревиатуры, если она есть. */
  hint: string | null;
}

export function lineageInfoRows(
  subjects: readonly LineageInfoSubject[],
): LineageInfoRow[] {
  return subjects.map((subject) => ({
    title: subject.title,
    value:
      lineageFilterLabel(subject.lineage) ??
      subject.emptyLabel ??
      "Для всех линий",
    hint: lineageOption(subject.lineage)?.hint ?? null,
  }));
}
