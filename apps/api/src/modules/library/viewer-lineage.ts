import {
  effectiveLineageIds,
  isLineagePreference,
  resolveMaterialFilters,
  type LineageId,
  type MaterialFilters,
} from '@vedamatch/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import { MATERIAL_FILTERS_SELECT } from './audience-stage-filter';

type ViewerPrisma = Pick<PrismaService, 'user'>;

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
 * запроса (ссылка «показать все линии») сильнее «Фильтров материалов» с
 * главной; без него действуют они (VED-617). Одно правило на ленту и на
 * список авторов (VED-621).
 *
 * Своей настройки линии у Образования больше нет (VED-628): кнопку
 * «Фильтры» убрали как дубль «Фильтров материалов», и записанная ею раньше
 * `LibraryPreference.lineage` не действует — иначе её нечем было бы снять.
 */
export function viewerLineageIds(
  explicit: string | undefined,
  filters: MaterialFilters,
): LineageId[] | null {
  if (explicit !== undefined && isLineagePreference(explicit) && explicit) {
    return effectiveLineageIds(explicit, filters);
  }
  return effectiveLineageIds(null, filters);
}
