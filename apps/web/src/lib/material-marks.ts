import {
  AUDIENCE_STAGES,
  type LineageId,
  type SpiritualStage,
} from "@vedamatch/shared";
import { audienceStagesSummary } from "./audience-stages";
import { lineageButtonLabel, markedToneClass } from "./lineage-menu";

/**
 * Логика окна «Разметка» (отпечаток пальца) у админа без разметки страницы:
 * ступени самоидентификации и линия материала в одном окне (VED-616).
 */

/** Разметка материала у админа: ступени и линия (VED-616). */
export interface MaterialMarks {
  stages: SpiritualStage[];
  lineage: LineageId | null;
}

/** Имя и подсказка кнопки «Разметка» (отпечаток пальца). */
export function materialMarksButtonLabel(marks: {
  stages?: readonly SpiritualStage[];
  lineage: LineageId | null;
}): string {
  const lineage = lineageButtonLabel(marks.lineage);
  if (!marks.stages) return `Разметка. ${lineage}`;
  return `Разметка. Ступени: ${audienceStagesSummary(marks.stages)}. ${lineage}`;
}

/**
 * Отмечены ли ступени: от одной до трёх. Пусто и все четыре — одно и то же
 * «для всех ступеней», кружок-счётчик на кнопке не показывается.
 */
export function hasMarkedStages(
  stages: readonly SpiritualStage[] | undefined,
): stages is readonly SpiritualStage[] {
  return (
    stages !== undefined &&
    stages.length > 0 &&
    stages.length < AUDIENCE_STAGES.length
  );
}

/**
 * Каёмка кнопки «Разметка» (VED-613): светло-малиновая, если у материала
 * есть любая разметка — отмечены ступени или выбрана линия; зелёная — только
 * «для всех» (ни ступеней, ни линии). Цвета те же, что у домика «Линия».
 */
export function materialMarksButtonToneClass(marks: {
  stages?: readonly SpiritualStage[];
  lineage: LineageId | null;
}): string {
  return markedToneClass(
    hasMarkedStages(marks.stages) || marks.lineage !== null,
  );
}
