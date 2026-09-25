import type { UnionConnectionRequestDto, UnionConnectionRequestsState } from '@vedamatch/shared';

/**
 * Порядок в списках «Лайки» и «Связи» — перенос `sort-likes.ts` и
 * `connections-panel.tsx` сайта. Чистая логика: экран только рисует.
 */

/**
 * Входящие лайки: избранные — те, кого человек сам отметил звёздочкой, —
 * первыми (ради этого звёздочка и заведена — разобрать кучу заявок); дальше
 * суперлайки, на них потрачена дневная квота; внутри групп — свежие сверху.
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

/** Лайки — это входящие заявки, которые ещё ждут ответа. */
export function pendingLikes(
  state: UnionConnectionRequestsState,
  favoriteUserIds: ReadonlySet<string>,
): UnionConnectionRequestDto[] {
  return sortIncomingLikes(
    state.incoming.filter((request) => request.status === 'pending'),
    favoriteUserIds,
  );
}

export type ConnectionTab = 'incoming' | 'outgoing' | 'accepted';

export const CONNECTION_TABS: readonly { key: ConnectionTab; label: string; empty: string }[] = [
  { key: 'incoming', label: 'Входящие', empty: 'Новых входящих заявок пока нет.' },
  { key: 'outgoing', label: 'Исходящие', empty: 'Исходящих заявок пока нет.' },
  { key: 'accepted', label: 'Принятые', empty: 'Принятых связей пока нет.' },
];

export const CONNECTION_STATUS_LABELS: Record<UnionConnectionRequestDto['status'], string> = {
  pending: 'Ожидает ответа',
  accepted: 'Принято',
  declined: 'Отклонено',
  cancelled: 'Отменено',
};

/**
 * Принятые связи из обоих направлений: заявку мог отправить и я, и мне.
 * Одна заявка дважды не встанет — ключ по id; свежий ответ сверху.
 */
export function acceptedConnections(state: UnionConnectionRequestsState): UnionConnectionRequestDto[] {
  const unique = new Map<string, UnionConnectionRequestDto>();
  for (const request of [...state.incoming, ...state.outgoing]) {
    if (request.status === 'accepted') unique.set(request.id, request);
  }
  return [...unique.values()].sort(
    (left, right) =>
      Date.parse(right.respondedAt ?? right.createdAt) - Date.parse(left.respondedAt ?? left.createdAt),
  );
}

/** Три списка вкладки «Связи». Ждущие ответа входящие — первыми. */
export function connectionLists(
  state: UnionConnectionRequestsState,
): Record<ConnectionTab, UnionConnectionRequestDto[]> {
  return {
    incoming: [...state.incoming].sort((left, right) => {
      if (left.status === 'pending' && right.status !== 'pending') return -1;
      if (left.status !== 'pending' && right.status === 'pending') return 1;
      return Date.parse(right.createdAt) - Date.parse(left.createdAt);
    }),
    outgoing: [...state.outgoing].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
    accepted: acceptedConnections(state),
  };
}

/** «Москва, Россия», а без обоих — прямо так и сказать. */
export function placeLine(user: { city: string | null; country: string | null }): string {
  return [user.city, user.country].filter(Boolean).join(', ') || 'Город не указан';
}

/**
 * Дата заявки числом: «24.09.2026». Руками, а не `toLocaleDateString`: Hermes
 * без полного ICU отдаёт формат системы, и подпись плясала бы от телефона.
 */
export function shortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${date.getFullYear()}`;
}

/** Переключить звёздочку в наборе избранных — новым набором, без мутаций. */
export function toggleFavorite(current: ReadonlySet<string>, userId: string): Set<string> {
  const next = new Set(current);
  if (next.has(userId)) next.delete(userId);
  else next.add(userId);
  return next;
}
