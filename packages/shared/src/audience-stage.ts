import type { SpiritualStage } from './index';

/**
 * Фильтр по самоидентификации (VED-575). Материал Образования и запись
 * Медиатеки размечаются ступенями, для которых они: от одной до четырёх,
 * пусто — для всех. Человек видит выбранные ступени и материалы «для всех»:
 * с VED-617 выбор — «Фильтры материалов» на главной (`material-filters.ts`),
 * а по умолчанию — своя ступень (`User.spiritualStage`).
 *
 * Правила — здесь, а не в каждом сервисе: разметку проверяют оба сервиса,
 * меню админа на вебе собирает тот же список, и копии разошлись бы.
 */

/** Ступени в порядке пути — так они стоят в меню и в подписи кнопки. */
export const AUDIENCE_STAGES: readonly SpiritualStage[] = [
  'seeker',
  'practitioner',
  'yogi',
  'devotee',
];

/** Больше ступеней не бывает: все четыре — то же, что «для всех» по смыслу. */
export const AUDIENCE_STAGES_MAX = AUDIENCE_STAGES.length;

/** Подписи ступеней для меню разметки и подсказок. */
export const AUDIENCE_STAGE_LABELS: Record<SpiritualStage, string> = {
  seeker: 'Ищущий',
  practitioner: 'Практикующий',
  yogi: 'Йог',
  devotee: 'Преданный',
};

export function isAudienceStage(value: unknown): value is SpiritualStage {
  return (
    typeof value === 'string' &&
    (AUDIENCE_STAGES as readonly string[]).includes(value)
  );
}

/**
 * Разметка из запроса админа: массив известных ступеней, без повторов, в
 * порядке пути. `null` — запрос неверен (не массив, неизвестная ступень);
 * пустой массив — «для всех».
 */
export function parseAudienceStages(raw: unknown): SpiritualStage[] | null {
  if (!Array.isArray(raw)) return null;
  if (!raw.every(isAudienceStage)) return null;
  const picked = new Set<SpiritualStage>(raw);
  return AUDIENCE_STAGES.filter((stage) => picked.has(stage));
}

/**
 * Разметка из базы: колонка строковая, и неизвестное значение (например,
 * после переименования ступени) молча отбрасывается, а не ломает карточку.
 */
export function toAudienceStages(
  raw: readonly string[] | null | undefined,
): SpiritualStage[] {
  if (!raw?.length) return [];
  const picked = new Set(raw.filter(isAudienceStage));
  return AUDIENCE_STAGES.filter((stage) => picked.has(stage));
}

/**
 * Какую ступень фильтровать для зрителя. `null` — фильтра нет: гость, человек
 * без самоидентификации (он видит всё) или выбравший «Все ступени».
 */
export function resolveAudienceStage(
  viewer:
    | {
        spiritualStage: SpiritualStage | string | null;
        showAllStages?: boolean | null;
      }
    | null
    | undefined,
): SpiritualStage | null {
  if (!viewer || viewer.showAllStages) return null;
  return isAudienceStage(viewer.spiritualStage) ? viewer.spiritualStage : null;
}

/** Виден ли материал с такой разметкой зрителю этой ступени. */
export function audienceStagesMatch(
  stages: readonly string[] | null | undefined,
  viewerStage: SpiritualStage | null,
): boolean {
  if (!viewerStage || !stages?.length) return true;
  return stages.includes(viewerStage);
}

/** Разметка ступеней у материала/записи из меню админа; `[]` — для всех. */
export interface SetAudienceStagesRequest {
  audienceStages: SpiritualStage[];
}
