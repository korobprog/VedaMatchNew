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

export const chatConversationInclude = {
  members: { include: { user: { select: chatUserSelect } } },
  community: { select: { id: true, slug: true, name: true } },
  pinnedMessage: { include: chatMessageInclude },
} satisfies Prisma.ChatConversationInclude;
