import type { UnionConnectionRequestDto } from "@vedamatch/shared";

/**
 * Порядок входящих лайков. Избранные — те, кого человек сам отметил, —
 * идут первыми: ради этого звёздочка и заведена, разобрать кучу заявок.
 * Дальше суперлайки: на них потрачена дневная квота. Внутри групп — свежие
 * сверху.
 *
 * Вынесено из компонента: чистая логика, проверяется без DOM.
 */
export function sortIncomingLikes(
  likes: UnionConnectionRequestDto[],
  favoriteUserIds: ReadonlySet<string>,
): UnionConnectionRequestDto[] {
  return [...likes].sort((left, right) => {
    const leftFav = favoriteUserIds.has(left.user.id);
    const rightFav = favoriteUserIds.has(right.user.id);
    if (leftFav !== rightFav) return leftFav ? -1 : 1;
    if (left.isSuperlike !== right.isSuperlike) return left.isSuperlike ? -1 : 1;
    return Date.parse(right.createdAt) - Date.parse(left.createdAt);
  });
}
