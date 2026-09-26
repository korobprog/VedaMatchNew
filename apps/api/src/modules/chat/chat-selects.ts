import type { Prisma } from '@prisma/client';

/**
 * Общие фрагменты выборки. Держим в одном месте: `spiritualName` обязан
 * ехать рядом с `name` в каждом запросе, иначе `resolveDisplayName` покажет
 * мирское имя — правило контракта, которое легче всего нарушить незаметно.
 */

export const chatUserSelect = {
  id: true,
  name: true,
  spiritualName: true,
  avatarUrl: true,
  // Загруженное фото: `avatarUrl` у него пуст, ссылку подписывает
  // `ChatSignedUrlsInterceptor` по ключу (VED-492). Наружу ключ не едет —
  // `toUserSummary` прячет его в символ.
  avatarKey: true,
  // «В сети» считается от этой отметки; без неё шапка беседы молчит о том,
  // здесь ли собеседник.
  lastSeenAt: true,
} satisfies Prisma.UserSelect;

export const chatMessageInclude = {
  author: { select: chatUserSelect },
  attachments: true,
  reactions: true,
  // Комментарии — это ответы на пост; считаем их разом с сообщением, чтобы
  // лента канала не делала запрос на каждую карточку.
  _count: { select: { replies: true } },
  replyTo: {
    select: {
      id: true,
      body: true,
      deletedAt: true,
      author: { select: chatUserSelect },
      attachments: { select: { kind: true }, take: 1 },
    },
  },
} satisfies Prisma.ChatMessageInclude;

/**
 * Беседа глазами участника `viewerId`.
 *
 * В обычной беседе приезжают все участники: на них держатся проверки прав,
 * собеседник диалога и доставка событий. В официальном канале VedaMatch
 * подписан весь портал, поэтому там приезжают только сам смотрящий,
 * администраторы канала и явно названные `alsoUserIds` (цель действия
 * администратора). Число подписчиков считает база в `_count`, а доставку
 * по всем подписчикам собирают отдельные узкие запросы.
 */
export function chatConversationInclude(
  viewerId: string,
  alsoUserIds: string[] = [],
) {
  return {
    members: {
      where: {
        OR: [
          { conversation: { is: { official: false } } },
          { userId: { in: [viewerId, ...alsoUserIds] } },
          { role: { in: ['owner', 'admin'] } },
        ],
      },
      include: { user: { select: chatUserSelect } },
    },
    _count: { select: { members: { where: { leftAt: null } } } },
    community: { select: { id: true, slug: true, name: true } },
    pinnedMessage: { include: chatMessageInclude },
  } satisfies Prisma.ChatConversationInclude;
}
