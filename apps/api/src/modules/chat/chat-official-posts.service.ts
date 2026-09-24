import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CHAT_MAX_ATTACHMENTS,
  type AppReleasePublishedEvent,
  type ChangelogAnnouncementPublishedEvent,
  type ChangelogAnnouncementWithdrawnEvent,
  type ChatAttachmentInput,
} from '@vedamatch/shared';
import { publicOrigin } from '../../common/public-origin';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatMessagesService } from './chat-messages.service';
import { ChatUploadsService } from './chat-uploads.service';
import {
  dueAction,
  OFFICIAL_POST_MAX_ATTEMPTS,
  parsePostImages,
  pickChannelAuthor,
  planPublished,
  planWithdrawn,
} from './official-post-plan';
import {
  appReleasePostFields,
  OFFICIAL_POST_SOURCE,
  officialPostText,
} from './official-post-text';

/** Пост «в работе» дольше этого — воркер упал посреди публикации. */
const POSTING_LEASE_MS = 5 * 60_000;

const selectRow = { id: true, status: true, messageId: true } as const;

/**
 * Посты официального канала VedaMatch от других сервисов: новости из
 * админки и выход новой версии приложения.
 *
 * События шины кладут пост в очередь (`ChatOfficialPost`), публикует его
 * воркер — в назначенное время, с повторами. Очередь, а не отправка прямо из
 * подписчика, по двум причинам: отложенная новость должна выйти в своё время,
 * когда никакого события уже нет, а упавшая публикация — повториться, а не
 * пропасть.
 *
 * От дублей защищает уникальность `source + sourceId`: второе событие о той
 * же новости или версии находит строку и не заводит новую.
 */
@Injectable()
export class ChatOfficialPostsService {
  private readonly logger = new Logger(ChatOfficialPostsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: ChatMessagesService,
    private readonly uploads: ChatUploadsService,
    private readonly config: ConfigService,
  ) {}

  // ===== Приём событий =====

  async acceptAnnouncement(
    event: ChangelogAnnouncementPublishedEvent,
    now = new Date(),
  ): Promise<void> {
    const key = {
      source: OFFICIAL_POST_SOURCE.announcement,
      sourceId: event.announcementId,
    };
    const existing = await this.prisma.chatOfficialPost.findUnique({
      where: { source_sourceId: key },
      select: selectRow,
    });
    const expiresAt = parseDate(event.expiresAt);
    const plan = planPublished(
      existing,
      {
        firstPublication: event.firstPublication,
        publishAt: parseDate(event.publishAt),
        expiresAt,
      },
      now,
    );
    const content = {
      title: event.title,
      body: event.body,
      path: event.path,
      expiresAt,
    };

    switch (plan.kind) {
      case 'create':
        await this.createOnce({
          ...key,
          ...content,
          images: event.images,
          authorHintId: event.actorId,
          publishAt: plan.publishAt,
        });
        return;
      case 'reschedule':
        // Условие по статусу: воркер мог взять пост между чтением и записью —
        // тогда он публикует прежний текст, а эта правка догонит сообщением.
        await this.prisma.chatOfficialPost.updateMany({
          where: { id: existing!.id, status: existing!.status },
          data: {
            ...content,
            images: event.images,
            authorHintId: event.actorId,
            publishAt: plan.publishAt,
            status: 'pending',
            attemptCount: 0,
            errorMessage: null,
          },
        });
        return;
      case 'edit':
        await this.prisma.chatOfficialPost.update({
          where: { id: existing!.id },
          data: content,
        });
        await this.editPosted(existing!.id);
        return;
      case 'ignore':
        return;
    }
  }

  async withdrawAnnouncement(
    event: ChangelogAnnouncementWithdrawnEvent,
  ): Promise<void> {
    const existing = await this.prisma.chatOfficialPost.findUnique({
      where: {
        source_sourceId: {
          source: OFFICIAL_POST_SOURCE.announcement,
          sourceId: event.announcementId,
        },
      },
      select: selectRow,
    });
    const plan = planWithdrawn(existing);
    if (plan.kind === 'ignore' || !existing) return;
    if (plan.kind === 'delete-message')
      await this.removeMessage(plan.messageId);
    // Пост «в работе» тоже отменяется: воркер, закончив, увидит отмену и
    // уберёт только что вышедшее сообщение сам.
    await this.prisma.chatOfficialPost.update({
      where: { id: existing.id },
      data: { status: 'cancelled', messageId: null },
    });
  }

  /**
   * Выпуск приложения. `true` — пост в очереди (или уже был), `false` — не
   * вышло: издатель повторит событие со следующего тика.
   */
  async acceptAppRelease(
    event: AppReleasePublishedEvent,
    now = new Date(),
  ): Promise<boolean> {
    try {
      await this.createOnce({
        source: OFFICIAL_POST_SOURCE.appRelease,
        sourceId: `${event.variant}:${event.versionCode}`,
        ...appReleasePostFields(event),
        path: event.path,
        images: [],
        authorHintId: null,
        publishAt: now,
        expiresAt: null,
      });
      return true;
    } catch (error) {
      this.logger.warn(
        `Пост о версии ${event.versionCode} не поставлен в очередь: ${messageOf(error)}`,
      );
      return false;
    }
  }

  /** Завести пост; уже заведённый — не ошибка, а защита от дубля. */
  private async createOnce(data: {
    source: string;
    sourceId: string;
    title: string;
    body: string;
    path: string;
    images: { url: string; width: number; height: number }[];
    authorHintId: string | null;
    publishAt: Date;
    expiresAt: Date | null;
  }): Promise<void> {
    try {
      await this.prisma.chatOfficialPost.create({ data });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }

  // ===== Публикация (воркер) =====

  /**
   * Пост «в работе» дольше лиза — воркер упал посреди публикации. Возвращаем
   * в очередь, пока попытки не кончились, иначе — `failed`.
   */
  async recoverStale(now = new Date()): Promise<void> {
    const staleBefore = new Date(now.getTime() - POSTING_LEASE_MS);
    await this.prisma.chatOfficialPost.updateMany({
      where: {
        status: 'posting',
        updatedAt: { lt: staleBefore },
        attemptCount: { lt: OFFICIAL_POST_MAX_ATTEMPTS },
      },
      data: { status: 'pending', errorMessage: 'lease_expired' },
    });
    await this.prisma.chatOfficialPost.updateMany({
      where: {
        status: 'posting',
        updatedAt: { lt: staleBefore },
        attemptCount: { gte: OFFICIAL_POST_MAX_ATTEMPTS },
      },
      data: { status: 'failed', errorMessage: 'lease_expired' },
    });
  }

  /**
   * Взять и опубликовать один пост, чья очередь настала. `false` — брать
   * нечего. Клейм — `updateMany` с проверкой статуса: второй воркер тот же
   * пост не возьмёт.
   */
  async publishNext(now = new Date()): Promise<boolean> {
    const next = await this.prisma.chatOfficialPost.findFirst({
      where: {
        status: 'pending',
        publishAt: { lte: now },
        attemptCount: { lt: OFFICIAL_POST_MAX_ATTEMPTS },
      },
      orderBy: { publishAt: 'asc' },
      select: { id: true },
    });
    if (!next) return false;
    const claimed = await this.prisma.chatOfficialPost.updateMany({
      where: { id: next.id, status: 'pending' },
      data: { status: 'posting', attemptCount: { increment: 1 } },
    });
    if (claimed.count === 0) return true;

    const post = await this.prisma.chatOfficialPost.findUnique({
      where: { id: next.id },
    });
    if (!post) return true;
    try {
      await this.publish(post, now);
    } catch (error) {
      const message = messageOf(error);
      await this.prisma.chatOfficialPost.updateMany({
        where: { id: post.id, status: 'posting' },
        data: {
          status:
            post.attemptCount >= OFFICIAL_POST_MAX_ATTEMPTS
              ? 'failed'
              : 'pending',
          errorMessage: message.slice(0, 500),
        },
      });
      this.logger.warn(
        `Пост ${post.source}/${post.sourceId} не опубликован (попытка ${post.attemptCount}): ${message}`,
      );
    }
    return true;
  }

  private async publish(
    post: {
      id: string;
      source: string;
      title: string;
      body: string;
      path: string;
      images: unknown;
      authorHintId: string | null;
      expiresAt: Date | null;
    },
    now: Date,
  ): Promise<void> {
    if (dueAction(post, now) === 'skip') {
      await this.prisma.chatOfficialPost.updateMany({
        where: { id: post.id, status: 'posting' },
        data: { status: 'skipped' },
      });
      return;
    }
    const channelId = await this.channelId();
    if (!channelId) throw new Error('Официальный канал не создан');
    const authorId = pickChannelAuthor(
      await this.channelAdmins(channelId),
      post.authorHintId,
    );
    if (!authorId)
      throw new Error('В канале нет администратора, писать некому');

    const attachments = await this.copyImages(channelId, post.images);
    // Не `silent`: пуш о посте получат ровно те, кто сам включил
    // уведомления канала, — у остальных канал заглушён при подписке.
    const message = await this.messages.send(authorId, channelId, {
      body: officialPostText(post, this.origin()),
      attachments,
    });
    const done = await this.prisma.chatOfficialPost.updateMany({
      where: { id: post.id, status: 'posting' },
      data: {
        status: 'posted',
        messageId: message.id,
        postedAt: now,
        errorMessage: null,
      },
    });
    // Новость сняли, пока пост уходил: сообщение, которое уже вышло,
    // убираем сами — снятие его ещё не видело.
    if (done.count === 0) await this.removeMessage(message.id);
  }

  /**
   * Картинки источника — копией в папку канала. Не скопировалась одна —
   * пост выходит без неё: новость важнее картинки, а повтор всего поста
   * ради неё задвоил бы остальное.
   */
  private async copyImages(
    channelId: string,
    raw: unknown,
  ): Promise<ChatAttachmentInput[]> {
    const attachments: ChatAttachmentInput[] = [];
    for (const image of parsePostImages(raw).slice(0, CHAT_MAX_ATTACHMENTS)) {
      try {
        const copy = await this.uploads.copyImageIntoConversation(
          channelId,
          image,
        );
        if (copy) attachments.push(copy);
      } catch (error) {
        this.logger.warn(`Картинка поста не скопирована: ${messageOf(error)}`);
      }
    }
    return attachments;
  }

  /** Правка вышедшего поста — текстом сообщения, от имени его автора. */
  private async editPosted(postId: string): Promise<void> {
    const post = await this.prisma.chatOfficialPost.findUnique({
      where: { id: postId },
      select: {
        source: true,
        title: true,
        body: true,
        path: true,
        message: {
          select: { id: true, authorId: true, body: true, deletedAt: true },
        },
      },
    });
    const message = post?.message;
    if (!post || !message || message.deletedAt) return;
    const text = officialPostText(post, this.origin());
    if (text === message.body) return;
    try {
      await this.messages.edit(message.authorId, message.id, text);
    } catch (error) {
      this.logger.warn(`Пост канала не поправлен: ${messageOf(error)}`);
    }
  }

  private async removeMessage(messageId: string): Promise<void> {
    const message = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { authorId: true, deletedAt: true },
    });
    if (!message || message.deletedAt) return;
    try {
      await this.messages.remove(message.authorId, messageId);
    } catch (error) {
      this.logger.warn(`Пост канала не удалён: ${messageOf(error)}`);
    }
  }

  private async channelId(): Promise<string | null> {
    const row = await this.prisma.chatConversation.findFirst({
      where: { official: true },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  /** Действующие администраторы канала — по времени вступления. */
  private async channelAdmins(conversationId: string): Promise<string[]> {
    const rows = await this.prisma.chatMember.findMany({
      where: {
        conversationId,
        leftAt: null,
        role: { in: ['owner', 'admin'] },
        user: { accountStatus: 'active' },
      },
      orderBy: { joinedAt: 'asc' },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

  /** Домен портала для ссылки «подробнее»: первый адрес `WEB_ORIGIN`. */
  private origin(): string | null {
    return (
      publicOrigin(this.config.get<string>('WEB_ORIGIN')) ??
      publicOrigin(this.config.get<string>('WEB_URL'))
    );
  }
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** P2002 — нарушение уникального индекса; `code` у `PrismaClientKnownRequestError`. */
function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P2002';
}
