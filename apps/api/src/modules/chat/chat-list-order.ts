import type { Prisma } from '@prisma/client';

/**
 * Порядок списка бесед (VED-308).
 *
 * Правило: официальный канал VedaMatch, затем закреплённое человеком, а
 * внутри каждой группы — свежее сообщение сверху. Беседы без единого
 * сообщения идут после переписки, между собой — от новых к старым.
 *
 * Раньше выборка шла `orderBy: [{ lastMessageAt: 'desc' }, …]`, а Postgres
 * при `DESC` ставит `NULL` первыми. Все пустые беседы («Пока ни одного
 * сообщения») вставали над живой перепиской, и только что пришедшее
 * сообщение оказывалось под ними. К тому же `take` отрезал хвост, и при
 * множестве пустых бесед из выдачи выпадали те, где писали.
 */
export const CHAT_LIST_ORDER_BY = [
  { lastMessageAt: { sort: 'desc', nulls: 'last' } },
  { createdAt: 'desc' },
] satisfies Prisma.ChatConversationOrderByWithRelationInput[];

/** Ровно те поля строки списка, от которых зависит порядок. */
export interface ChatListOrderItem {
  official?: boolean;
  pinned: boolean;
  lastMessageAt?: string | null;
}

function activity(item: ChatListOrderItem): number | null {
  if (!item.lastMessageAt) return null;
  const time = new Date(item.lastMessageAt).getTime();
  return Number.isNaN(time) ? null : time;
}

/**
 * Сравнение двух бесед: меньше — выше в списке. Пустые беседы между собой
 * равны: их порядок (по дате создания) уже задал запрос, сортировка стабильна.
 */
export function compareChatListItems(
  a: ChatListOrderItem,
  b: ChatListOrderItem,
): number {
  const official = Number(Boolean(b.official)) - Number(Boolean(a.official));
  if (official !== 0) return official;
  const pinned = Number(b.pinned) - Number(a.pinned);
  if (pinned !== 0) return pinned;
  const at = activity(a);
  const bt = activity(b);
  if (at === null && bt === null) return 0;
  if (at === null) return 1;
  if (bt === null) return -1;
  return bt - at;
}

/** Список в нужном порядке, не трогая исходный массив. */
export function sortChatList<T extends ChatListOrderItem>(
  items: readonly T[],
): T[] {
  return [...items].sort(compareChatListItems);
}
