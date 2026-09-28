import type { SpiritualStage } from './index';
import {
  AUDIENCE_STAGES,
  AUDIENCE_STAGE_LABELS,
  isAudienceStage,
  toAudienceStages,
} from './audience-stage';
import {
  LINEAGE_ALL,
  LINEAGE_IDS,
  isDevotee,
  isLineageId,
  lineageFilterIds,
  lineageFilterLabel,
  lineageGroupOf,
  lineagesOfGroup,
  lineageOption,
  LINEAGE_GROUP_LABELS,
  LINEAGE_GROUPS,
  type LineageId,
  type LineagePreference,
} from './lineage';

/**
 * «Фильтры материалов» (VED-617): какие материалы Образования и Медиатеки
 * человек видит на всём портале. Два раздела с мультивыбором — ступени
 * самоидентификации и духовные линии. Пустой раздел — «все»: фильтра по нему
 * нет, и материал без разметки (для всех ступеней, для всех линий) виден
 * при любом выборе.
 *
 * Пока человек фильтры не трогал, они выводятся из анкеты: своя ступень и,
 * у преданного, своя линия. Как только он выбрал руками — решает выбор
 * (`User.materialFiltersSetAt`), а анкета остаётся как была: сменить
 * самоидентификацию можно только пройдя её заново.
 *
 * Прежний переключатель «Все ступени» (VED-575, `User.showAllStages`)
 * читается как умолчание: кто его включил, без ручного выбора видит все
 * ступени, как и раньше.
 */
export interface MaterialFilters {
  /** Ступени в порядке пути; `[]` — все ступени. */
  stages: SpiritualStage[];
  /** Линии в порядке справочника; `[]` — все линии. */
  lineages: LineageId[];
}

/** Фильтры в профиле: значения и выбраны ли они руками. */
export interface MaterialFiltersState extends MaterialFilters {
  /** `false` — выведены из анкеты и поменяются вместе с ней. */
  custom: boolean;
}

/** Ровно те поля `User`, из которых собираются фильтры. */
export interface MaterialFiltersViewer {
  spiritualStage: SpiritualStage | string | null;
  lineage: string | null;
  showAllStages?: boolean | null;
  materialFiltersSetAt?: Date | string | null;
  materialStages?: readonly string[] | null;
  materialLineages?: readonly string[] | null;
}

/** Запрос сохранения: `null` — вернуться к фильтрам по анкете. */
export interface UpdateMaterialFiltersRequest {
  materialFilters: MaterialFilters | null;
}

/** Линии из базы: неизвестные строки отбрасываются, порядок — справочника. */
export function toMaterialLineages(
  raw: readonly string[] | null | undefined,
): LineageId[] {
  if (!raw?.length) return [];
  const picked = new Set(raw.filter(isLineageId));
  return LINEAGE_IDS.filter((id) => picked.has(id));
}

/**
 * Сжатие выбора: отмеченные все ступени или все линии — то же, что «все», и
 * хранится пустым разделом. Иначе новая линия справочника, добавленная
 * позже, выпала бы у того, кто просил «хоть все».
 */
export function normalizeMaterialFilters(
  filters: MaterialFilters,
): MaterialFilters {
  const stages = toAudienceStages(filters.stages);
  const lineages = toMaterialLineages(filters.lineages);
  return {
    stages: stages.length === AUDIENCE_STAGES.length ? [] : stages,
    lineages: lineages.length === LINEAGE_IDS.length ? [] : lineages,
  };
}

/** Фильтры по анкете: своя ступень и своя линия у преданного. */
export function defaultMaterialFilters(
  viewer: MaterialFiltersViewer | null | undefined,
): MaterialFilters {
  if (!viewer) return { stages: [], lineages: [] };
  const stage = isAudienceStage(viewer.spiritualStage)
    ? viewer.spiritualStage
    : null;
  // Линия — только у преданного, как и везде (`isDevotee`): остальные
  // ступени её не выбирают.
  const lineage =
    isDevotee({ spiritualStage: stage, lineage: null }) &&
    isLineageId(viewer.lineage)
      ? viewer.lineage
      : null;
  return {
    stages: stage && !viewer.showAllStages ? [stage] : [],
    lineages: lineage ? [lineage] : [],
  };
}

/** Действующие фильтры человека: ручной выбор, а без него — по анкете. */
export function resolveMaterialFilters(
  viewer: MaterialFiltersViewer | null | undefined,
): MaterialFiltersState {
  if (viewer?.materialFiltersSetAt) {
    return {
      ...normalizeMaterialFilters({
        stages: toAudienceStages(viewer.materialStages),
        lineages: toMaterialLineages(viewer.materialLineages),
      }),
      custom: true,
    };
  }
  return { ...defaultMaterialFilters(viewer), custom: false };
}

/**
 * Разбор запроса: `null` — «по анкете», объект с двумя массивами известных
 * значений — выбор. `undefined` — запрос неверен.
 */
export function parseMaterialFilters(
  raw: unknown,
): MaterialFilters | null | undefined {
  if (raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const { stages, lineages } = raw as Record<string, unknown>;
  if (!Array.isArray(stages) || !Array.isArray(lineages)) return undefined;
  if (!stages.every(isAudienceStage) || !lineages.every(isLineageId)) {
    return undefined;
  }
  return normalizeMaterialFilters({ stages, lineages });
}

/**
 * Какие линии пропускает лента сервиса: `null` — все.
 *
 * Выбор внутри сервиса сильнее портального: явный `?lineage=` или настройка
 * сервиса (`LibraryPreference.lineage`, `MusicSettings.lineage`) — это линия
 * или группа, `'all'` — все линии. Без неё (`null`) действуют «Фильтры
 * материалов» с главной.
 */
export function effectiveLineageIds(
  servicePreference: LineagePreference | undefined,
  filters: MaterialFilters,
): LineageId[] | null {
  if (servicePreference === LINEAGE_ALL) return null;
  if (servicePreference) return lineageFilterIds(servicePreference);
  return filters.lineages.length ? [...filters.lineages] : null;
}

/** Какие ступени пропускает лента: `null` — все. */
export function effectiveAudienceStages(
  filters: MaterialFilters,
): SpiritualStage[] | null {
  return filters.stages.length ? [...filters.stages] : null;
}

/** Виден ли материал с такой разметкой при таких фильтрах. */
export function materialMatchesFilters(
  material: {
    audienceStages?: readonly string[] | null;
    lineage?: string | null;
  },
  filters: MaterialFilters,
): boolean {
  const stages = material.audienceStages ?? [];
  const stageOk =
    !filters.stages.length ||
    !stages.length ||
    filters.stages.some((stage) => stages.includes(stage));
  const lineageOk =
    !filters.lineages.length ||
    !material.lineage ||
    (filters.lineages as readonly string[]).includes(material.lineage);
  return stageOk && lineageOk;
}

/**
 * Подпись набора линий: «ISKCON», «Гаудия-матх» для группы целиком,
 * «Гаудия-матх — IPBYS» для одной линии, короткие названия через запятую —
 * для нескольких. `null` — фильтра нет.
 */
export function lineageIdsLabel(
  ids: readonly LineageId[] | null | undefined,
): string | null {
  if (!ids?.length) return null;
  if (ids.length === 1) return lineageFilterLabel(ids[0]);
  const group = lineageGroupOf(ids[0]);
  if (
    group &&
    ids.every((id) => lineageGroupOf(id) === group) &&
    lineagesOfGroup(group).length === ids.length
  ) {
    return LINEAGE_GROUP_LABELS[group];
  }
  // Группы, отмеченные целиком, — одним словом, остальное — по линиям.
  const parts: string[] = [];
  for (const g of LINEAGE_GROUPS) {
    const inGroup = lineagesOfGroup(g).map((item) => item.id);
    const picked = inGroup.filter((id) => ids.includes(id));
    if (!picked.length) continue;
    if (picked.length === inGroup.length) parts.push(LINEAGE_GROUP_LABELS[g]);
    else parts.push(...picked.map((id) => lineageOption(id)?.shortLabel ?? id));
  }
  return parts.join(', ');
}

/** Подпись набора ступеней словами; `null` — все ступени. */
export function audienceStagesLabel(
  stages: readonly SpiritualStage[] | null | undefined,
): string | null {
  if (!stages?.length || stages.length === AUDIENCE_STAGES.length) return null;
  return AUDIENCE_STAGES.filter((stage) => stages.includes(stage))
    .map((stage) => AUDIENCE_STAGE_LABELS[stage])
    .join(', ');
}
