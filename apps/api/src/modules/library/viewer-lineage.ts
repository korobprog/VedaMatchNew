import {
  effectiveLineageIds,
  isLineagePreference,
  resolveMaterialFilters,
  toLineagePreference,
  type LineageId,
  type MaterialFilters,
} from '@vedamatch/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import { MATERIAL_FILTERS_SELECT } from './audience-stage-filter';

type ViewerPrisma = Pick<PrismaService, 'user' | 'libraryPreference'>;

/**
 * «Фильтры материалов» зрителя (VED-617): ступени и линии с главной, а без
 * ручного выбора — по анкете. Из `User` — ровно поля фильтров, анкеты и
 * прежнего переключателя «Все ступени»; пишет их портал. Гость — без
 * фильтров.
 */
export async function loadViewerMaterialFilters(
  prisma: ViewerPrisma,
  viewerId: string | undefined,
): Promise<MaterialFilters> {
  if (!viewerId) return { stages: [], lineages: [] };
  const user = await prisma.user.findUnique({
    where: { id: viewerId },
    select: MATERIAL_FILTERS_SELECT,
  });
  return resolveMaterialFilters(user);
}

/**
 * Какие линии видит зритель в Образовании: `null` — все. Явный параметр
 * запроса сильнее настройки Образования, та — сильнее «Фильтров материалов»
 * с главной; без настройки действуют они (VED-617). Одно правило на ленту
 * и на список авторов (VED-621).
 */
export async function loadViewerLineageIds(
  prisma: ViewerPrisma,
  viewerId: string | undefined,
  explicit: string | undefined,
  filters: MaterialFilters,
): Promise<LineageId[] | null> {
  if (explicit !== undefined && isLineagePreference(explicit) && explicit) {
    return effectiveLineageIds(explicit, filters);
  }
  if (!viewerId) return null;
  const preference = await prisma.libraryPreference.findUnique({
    where: { userId: viewerId },
    select: { lineage: true },
  });
  return effectiveLineageIds(toLineagePreference(preference?.lineage), filters);
}
