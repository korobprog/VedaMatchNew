import type { CommunityBadgeDto } from '@vedamatch/shared';

/**
 * Порядок общин в списке: та, что отмечена значком в профиле (`isPrimary`),
 * всегда первой, дальше — по алфавиту. Сервер `GET /communities/me` порядок
 * не гарантирует (`myCommunities` в `communities.service.ts`), поэтому
 * список сортируется на клиенте.
 */
export function sortMemberships(memberships: readonly CommunityBadgeDto[]): CommunityBadgeDto[] {
  return [...memberships].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.name.localeCompare(b.name, 'ru');
  });
}
