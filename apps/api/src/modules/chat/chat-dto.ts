import type {
  ChatAttachment,
  ChatConversation,
  ChatMember,
  ChatMessage,
  ChatMessageReaction,
  Community,
  User,
} from '@prisma/client';
import {
  resolveDisplayName,
  type ChatAttachmentDto,
  type ChatConversationSummary,
  type ChatMemberDto,
  type ChatMessageDto,
  type ChatReactionSummary,
  type ChatUserSummary,
} from '@vedamatch/shared';
import { canWrite } from './chat-access';

/**
 * Сборка того, что уезжает в браузер. Отдельным модулем: полей много, и
 * ошибка в одном месте — это либо мирское имя вместо духовного, либо чужой
 * счётчик непрочитанного, показанный не тому.
 */

/** Минимум, который обязан тянуть Prisma-`select`, чтобы имя собралось верно. */
export type ChatUserRow = Pick<
  User,
  'id' | 'name' | 'spiritualName' | 'avatarUrl'
> & { lastSeenAt?: Date | null };

export type ChatMessageRow = ChatMessage & {
  author: ChatUserRow;
  attachments: ChatAttachment[];
  reactions: ChatMessageReaction[];
  /** Сколько комментариев под постом — приходит из _count, см. chat-selects. */
  _count?: { replies?: number };
  replyTo?:
    | (Pick<ChatMessage, 'id' | 'body' | 'deletedAt'> & {
        author: ChatUserRow;
        attachments?: Pick<ChatAttachment, 'kind'>[];
      })
    | null;
};

export type ChatConversationRow = ChatConversation & {
  members: (ChatMember & { user: ChatUserRow })[];
  community?: Pick<Community, 'id' | 'slug' | 'name'> | null;
  /** Закреплённое сообщение приезжает вместе с беседой — см. chat-selects. */
  pinnedMessage?: ChatMessageRow | null;
};

export function toUserSummary(row: ChatUserRow): ChatUserSummary {
  return {
    id: row.id,
    // Имя собирает resolveDisplayName, а не user.name — правило контракта.
    name: resolveDisplayName(row),
    avatarUrl: row.avatarUrl,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
  };
}

export function toAttachmentDto(row: ChatAttachment): ChatAttachmentDto {
  return {
    id: row.id,
    kind: row.kind,
    url: row.url,
    previewUrl: row.previewUrl,
    title: row.title,
    subtitle: row.subtitle,
    body: row.body,
    sourceService: row.sourceService,
    sourceId: row.sourceId,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    durationSec: row.durationSec,
    width: row.width,
    height: row.height,
    waveform: row.waveform,
  };
}

/** Сводка реакций: сколько кого и стоит ли моя. */
export function toReactionSummaries(
  rows: Pick<ChatMessageReaction, 'emoji' | 'userId'>[],
  viewerId: string,
): ChatReactionSummary[] {
  const byEmoji = new Map<string, ChatReactionSummary>();
  for (const row of rows) {
    const current = byEmoji.get(row.emoji) ?? {
      emoji: row.emoji,
      count: 0,
      mine: false,
    };
    current.count += 1;
    if (row.userId === viewerId) current.mine = true;
    byEmoji.set(row.emoji, current);
  }
  return [...byEmoji.values()].sort((a, b) => b.count - a.count);
}

/**
 * Сообщение наружу. Удалённое не вырезается из ленты, а приезжает пустым:
 * исчезнувшее сообщение ломает нумерацию ответов у того, кто смотрит.
 */
export function toMessageDto(
  row: ChatMessageRow,
  viewerId: string,
  /** Когда собеседники в последний раз читали — для галочки «прочитано». */
  othersLastReadAt?: Date | null,
  /**
   * «Избранное» — беседа с самим собой. Галочек там не бывает вовсе: без
   * этого признака каждая своя заметка вечно висела бы «доставлено, не
   * прочитано», потому что читать её, кроме автора, некому.
   */
  options?: { saved?: boolean },
): ChatMessageDto {
  const deleted = Boolean(row.deletedAt);
  return {
    id: row.id,
    conversationId: row.conversationId,
    author: toUserSummary(row.author),
    body: deleted ? '' : row.body,
    replyTo: row.replyTo
      ? {
          id: row.replyTo.id,
          authorName: resolveDisplayName(row.replyTo.author),
          body: row.replyTo.deletedAt ? '' : row.replyTo.body,
          attachmentKind: row.replyTo.attachments?.[0]?.kind ?? null,
        }
      : null,
    attachments: deleted
      ? []
      : [...row.attachments]
          .sort((a, b) => a.position - b.position)
          .map(toAttachmentDto),
    reactions: deleted ? [] : toReactionSummaries(row.reactions, viewerId),
    editedAt: row.editedAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    readByOthers:
      row.authorId === viewerId && !options?.saved
        ? Boolean(othersLastReadAt && othersLastReadAt >= row.createdAt)
        : undefined,
    viewsCount: row.viewsCount,
    commentsCount: row._count?.replies,
    forwardedFrom: row.forwardedFrom,
  };
}

export function toMemberDto(
  row: ChatMember & { user: ChatUserRow },
): ChatMemberDto {
  return {
    user: toUserSummary(row.user),
    role: row.role,
    joinedAt: row.joinedAt.toISOString(),
    lastReadAt: row.lastReadAt?.toISOString() ?? null,
  };
}

/**
 * Заголовок беседы. У личного диалога своего заголовка нет: он собирается
 * из собеседника, иначе каждый видел бы в списке собственное имя.
 */
export function conversationTitle(
  row: ChatConversationRow,
  viewerId: string,
): {
  title: string;
  companion: ChatUserSummary | null;
  avatarUrl: string | null;
} {
  // «Избранное» — тоже личный диалог, только с самим собой: собеседника в
  // нём нет, и запасной заголовок «Диалог» показал бы человеку не то.
  if (row.savedForId && row.savedForId === viewerId)
    return { title: 'Избранное', companion: null, avatarUrl: null };

  if (row.kind !== 'direct')
    return {
      title: row.title ?? 'Беседа',
      companion: null,
      avatarUrl: row.avatarUrl ?? null,
    };

  const companionRow = row.members.find((m) => m.userId !== viewerId);
  const companion = companionRow ? toUserSummary(companionRow.user) : null;
  return {
    title: companion?.name ?? 'Диалог',
    companion,
    avatarUrl: companion?.avatarUrl ?? null,
  };
}

export function toConversationSummary(
  row: ChatConversationRow,
  viewerId: string,
  extra: {
    unreadCount: number;
    lastMessage?: ChatMessageDto | null;
    messageCount?: number;
  },
): ChatConversationSummary {
  const mine = row.members.find((m) => m.userId === viewerId);
  const { title, companion, avatarUrl } = conversationTitle(row, viewerId);
  const saved = Boolean(row.savedForId && row.savedForId === viewerId);
  const now = new Date();

  return {
    id: row.id,
    kind: row.kind,
    state: row.state,
    visibility: row.visibility,
    title,
    avatarUrl,
    companion,
    community: row.community
      ? {
          id: row.community.id,
          slug: row.community.slug,
          name: row.community.name,
        }
      : null,
    membersCount: row.members.filter((m) => !m.leftAt).length,
    saved,
    // В беседе с собой непрочитанного не бывает: писать её, кроме автора,
    // некому, а значок на плитке главной он получал бы от самого себя.
    unreadCount: saved ? 0 : extra.unreadCount,
    muted: Boolean(mine?.mutedUntil && mine.mutedUntil > now),
    pinned: Boolean(mine?.pinnedAt),
    canWrite: canWrite(
      {
        kind: row.kind,
        state: row.state,
        requestedById: row.requestedById,
        messageCount: extra.messageCount,
      },
      mine
        ? { userId: mine.userId, role: mine.role, leftAt: mine.leftAt }
        : null,
    ),
    lastMessage: extra.lastMessage ?? null,
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
  };
}
