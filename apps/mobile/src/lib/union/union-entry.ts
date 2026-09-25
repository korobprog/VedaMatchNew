import type { UserProfile } from '@vedamatch/shared';

/**
 * Куда ведёт вход в Знакомства — тот же порядок, что у `/union` на сайте
 * (`apps/web/src/app/(portal)/union/page.tsx`): сначала место жительства,
 * потом анкета, потом подбор.
 *
 * Место — первым, потому что без координат подбор не работает вовсе: фильтр
 * «рядом» и расстояние в совместимости считаются от них. Анкета — вторым:
 * сохранённая анкета значит, что человеку сразу нужен поиск, а не форма.
 */
export type UnionEntry = 'location' | 'profile' | 'recommendations';

/** Полное место жительства: город, страна и координаты. Одного города мало. */
export function hasCompleteUnionLocation(profile: Pick<UserProfile, 'homeLocation'> | null | undefined): boolean {
  const location = profile?.homeLocation;
  return Boolean(
    location?.city?.trim() &&
      location.country?.trim() &&
      Number.isFinite(location.lat) &&
      Number.isFinite(location.lon),
  );
}

export function unionEntry({ hasLocation, hasProfile }: { hasLocation: boolean; hasProfile: boolean }): UnionEntry {
  if (!hasLocation) return 'location';
  return hasProfile ? 'recommendations' : 'profile';
}
