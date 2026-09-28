import {
  LINEAGE_IDS,
  audienceStagesLabel,
  lineageIdsLabel,
  lineagesOfGroup,
  resolveMaterialFilters,
  type LineageGroup,
  type LineageId,
  type MaterialFilters,
  type MaterialFiltersState,
  type UserProfile,
} from "@vedamatch/shared";

/**
 * Логика кнопки «Фильтры материалов» на главной (VED-617) без разметки
 * страницы. Сами правила фильтра — в `@vedamatch/shared`.
 */

/** Отметить/снять линию. Порядок — всегда по справочнику. */
export function toggleLineage(
  current: readonly LineageId[],
  id: LineageId,
): LineageId[] {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return LINEAGE_IDS.filter((item) => next.has(item));
}

/** Отмечена ли группа: целиком, частично или никак. */
export function lineageGroupState(
  current: readonly LineageId[],
  group: LineageGroup,
): "all" | "some" | "none" {
  const ids = lineagesOfGroup(group).map((item) => item.id);
  const picked = ids.filter((id) => current.includes(id)).length;
  if (picked === 0) return "none";
  return picked === ids.length ? "all" : "some";
}

/**
 * Отметка группы: отмеченная целиком снимается, иначе отмечается вся —
 * как «выбрать все» у почтового списка.
 */
export function toggleLineageGroup(
  current: readonly LineageId[],
  group: LineageGroup,
): LineageId[] {
  const ids = lineagesOfGroup(group).map((item) => item.id);
  const next = new Set(current);
  const clear = lineageGroupState(current, group) === "all";
  for (const id of ids) {
    if (clear) next.delete(id);
    else next.add(id);
  }
  return LINEAGE_IDS.filter((item) => next.has(item));
}

/** Совпадают ли два набора фильтров (порядок значения не имеет). */
export function sameMaterialFilters(
  a: MaterialFilters,
  b: MaterialFilters,
): boolean {
  const same = (x: readonly string[], y: readonly string[]) =>
    x.length === y.length && x.every((item) => y.includes(item));
  return same(a.stages, b.stages) && same(a.lineages, b.lineages);
}

/** Сужают ли фильтры выдачу хоть в одном разделе. */
export function materialFiltersActive(filters: MaterialFilters): boolean {
  return filters.stages.length > 0 || filters.lineages.length > 0;
}

/**
 * Имя и подсказка кнопки «Фильтры материалов»: что видно сейчас, чтобы не
 * открывать окно ради ответа.
 */
export function materialFiltersButtonLabel(filters: MaterialFilters): string {
  const stages = audienceStagesLabel(filters.stages) ?? "все";
  const lineages = lineageIdsLabel(filters.lineages) ?? "все";
  return `Фильтры материалов: ступени — ${stages}; линии — ${lineages}`;
}

/**
 * Фильтры из профиля. Старый ответ API без `materialFilters` собирается из
 * анкеты теми же правилами, что на сервере; гость — без фильтров.
 */
export function profileMaterialFilters(
  user: Pick<
    UserProfile,
    "spiritualStage" | "lineage" | "showAllStages" | "materialFilters"
  > | null,
): MaterialFiltersState {
  if (!user) return { stages: [], lineages: [], custom: false };
  return user.materialFilters ?? resolveMaterialFilters(user);
}
