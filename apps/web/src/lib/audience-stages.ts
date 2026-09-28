import {
  AUDIENCE_STAGES,
  AUDIENCE_STAGE_LABELS,
  type SpiritualStage,
} from "@vedamatch/shared";

/**
 * Логика кнопок фильтра по самоидентификации (VED-575) без разметки: меню
 * «Ступени» у админа и переключатель «Моя ступень / Все ступени» на главной.
 */

/** Отметить/снять ступень в черновике меню. Порядок — всегда по пути. */
export function toggleAudienceStage(
  current: readonly SpiritualStage[],
  stage: SpiritualStage,
): SpiritualStage[] {
  const next = new Set(current);
  if (next.has(stage)) next.delete(stage);
  else next.add(stage);
  return AUDIENCE_STAGES.filter((item) => next.has(item));
}

/** Совпадают ли два набора ступеней без учёта порядка. */
export function sameAudienceStages(
  a: readonly SpiritualStage[],
  b: readonly SpiritualStage[],
): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((stage) => set.has(stage));
}

/** Перечень ступеней словами; пусто — «для всех». */
export function audienceStagesSummary(
  stages: readonly SpiritualStage[],
): string {
  if (stages.length === 0 || stages.length === AUDIENCE_STAGES.length) {
    return "для всех";
  }
  return AUDIENCE_STAGES.filter((stage) => stages.includes(stage))
    .map((stage) => AUDIENCE_STAGE_LABELS[stage])
    .join(", ");
}

/** Имя и подсказка кнопки «Ступени» у админа. */
export function audienceStagesButtonLabel(
  stages: readonly SpiritualStage[],
): string {
  return `Ступени самоидентификации: ${audienceStagesSummary(stages)}`;
}

/**
 * Подсказка переключателя на главной: что человек видит сейчас и что будет
 * по нажатию. Имя кнопки при этом постоянное («Материалы всех ступеней»),
 * а состояние передаёт `aria-pressed` — так скринридер не слышит двойного
 * «включено».
 */
export function stageScopeTitle(
  stage: SpiritualStage,
  showAll: boolean,
): string {
  const mine = AUDIENCE_STAGE_LABELS[stage];
  return showAll
    ? `Показаны материалы всех ступеней. Нажмите, чтобы видеть только для ступени «${mine}»`
    : `Показаны материалы для ступени «${mine}» и для всех. Нажмите, чтобы видеть материалы всех ступеней`;
}
