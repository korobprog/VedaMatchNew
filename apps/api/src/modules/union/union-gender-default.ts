import type { Gender } from '@vedamatch/shared';

/**
 * Пол в ленте Знакомств (VED-652): «по умолчанию — показать только
 * противоположный пол. Когда заходит новый человек, у него должны быть видны
 * все анкеты противоположного пола. А дальше пусть уже сам регулирует».
 *
 * - явно выбранный пол — он;
 * - `all` («Показать всех» на панели) — без отбора по полу;
 * - режим «Показать всех» пустой выдачи (`showAll`) — тоже без отбора: «все»
 *   значит все, умолчание — не выбор человека;
 * - иначе — противоположный полу смотрящего; пол не указан — без отбора.
 */
export function resolveUnionGenderFilter(
  raw: unknown,
  viewerGender: Gender | null,
  showAll: boolean,
): Gender | undefined {
  if (raw === 'male' || raw === 'female') return raw;
  if (raw === 'all' || showAll) return undefined;
  if (viewerGender === 'male') return 'female';
  if (viewerGender === 'female') return 'male';
  return undefined;
}
