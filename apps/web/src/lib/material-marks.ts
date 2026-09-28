import type { LineageId, SpiritualStage } from "@vedamatch/shared";
import { audienceStagesSummary } from "./audience-stages";
import { lineageButtonLabel } from "./lineage-menu";

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
