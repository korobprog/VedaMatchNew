import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  CHAT_STATUS_MAX_ACTIVE,
  type ChatStatusAuthorDto,
  type ChatStatusDto,
  type ChatStatusFeedResponse,
  type ChatStatusRing,
  type ChatUserSummary,
} from '@vedamatch/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { toUserSummary } from '../chat-dto';
import { chatUserSelect } from '../chat-selects';
import { ChatUploadsService } from '../chat-uploads.service';
import {
  buildStatusFeed,
  statusExpiresAt,
  statusMediaKindFor,
  statusRings,
  statusText,
  statusUploadDenial,
  statusVideoDurationDenial,
  toStatusDto,
  type StatusRow,
} from './chat-status-rules';
import { ChatStatusVideoService } from './chat-status-video.service';

export interface UploadedStatusFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/** Сколько аватарок можно спросить про кружки за раз. */
const MAX_RING_USERS = 200;

/**
 * Статусы (VED-129): публикация, лента, кружки вокруг аватарок, просмотры.
 *
 * Статус виден всем участникам портала, кроме заблокированных в любую
 * сторону и удалённых аккаунтов. Живёт сутки: истёкшие не попадают ни в
 * одну выборку, а строки и файлы убирает `ChatRetentionService`.
 */
@Injectable()
export class ChatStatusesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: ChatUploadsService,
    private readonly video: ChatStatusVideoService,
  ) {}

  async feed(
    viewerId: string,
    now = new Date(),
  ): Promise<ChatStatusFeedResponse> {
    const rows = await this.activeRows(viewerId, undefined, now);
    const users = await this.visibleUsers(
      viewerId,
      rows.map((row) => row.authorId),
    );
    return buildStatusFeed(rows, users, viewerId);
  }

  /** Статусы одного человека — для кружка в шапке беседы и в профиле. */
  async ofUser(
    viewerId: string,
    userId: string,
    now = new Date(),
  ): Promise<ChatStatusAuthorDto | null> {
    const users = await this.visibleUsers(viewerId, [userId]);
    if (!users.has(userId)) return null;
    const rows = await this.activeRows(viewerId, [userId], now);
    if (rows.length === 0) return null;
    const feed = buildStatusFeed(rows, users, viewerId);
    return feed.mine ?? feed.others[0] ?? null;
  }

  /** Кружки для списка аватарок. Недоступных и без статусов в ответе нет. */
  async rings(
    viewerId: string,
    userIds: string[],
    now = new Date(),
  ): Promise<Record<string, ChatStatusRing>> {
    const ids = [...new Set(userIds)].slice(0, MAX_RING_USERS);
    if (ids.length === 0) return {};
    const users = await this.visibleUsers(viewerId, ids);
    const visible = ids.filter((id) => users.has(id));
    if (visible.length === 0) return {};
    const rows = await this.prisma.chatStatus.findMany({
      where: { authorId: { in: visible }, expiresAt: { gt: now } },
      select: {
        authorId: true,
        views: { where: { viewerId }, select: { viewerId: true } },
      },
    });
    return statusRings(
      rows.map((row) => ({
        authorId: row.authorId,
        viewedByViewer: row.views.length > 0,
      })),
      viewerId,
    );
  }

  async create(
    authorId: string,
    body: { text?: unknown },
    file: UploadedStatusFile | undefined,
    now = new Date(),
  ): Promise<ChatStatusDto> {
    const content = statusText(body?.text, Boolean(file));
    if ('denial' in content) throw new BadRequestException(content.denial);

    const active = await this.prisma.chatStatus.count({
      where: { authorId, expiresAt: { gt: now } },
    });
    if (active >= CHAT_STATUS_MAX_ACTIVE)
      throw new BadRequestException(
        `Не больше ${CHAT_STATUS_MAX_ACTIVE} статусов за сутки`,
      );

    let media: Partial<{
      mediaKind: 'photo' | 'video';
      mediaUrl: string;
      mediaKey: string;
      posterUrl: string;
      posterKey: string;
      width: number | null;
      height: number | null;
      durationSec: number | null;
    }> = {};

    if (file) {
      const denial = statusUploadDenial(file);
      if (denial) throw new BadRequestException(denial);
      if (!this.uploads.configured)
        throw new ServiceUnavailableException(
          'Загрузка файлов сейчас недоступна',
        );
      if (statusMediaKindFor(file.mimetype) === 'photo') {
        const stored = await this.uploads.storeStatusImage(
          authorId,
          file.buffer,
        );
        if (!stored)
          throw new ServiceUnavailableException('Фото не сохранилось');
        media = {
          mediaKind: 'photo',
          mediaUrl: stored.url,
          mediaKey: stored.key,
          width: stored.width,
          height: stored.height,
        };
      } else {
        const extension = file.mimetype === 'video/webm' ? '.webm' : '.mp4';
        const inspected = await this.video.inspect(file.buffer, extension);
        const durationDenial = statusVideoDurationDenial(
          inspected?.info.durationSec ?? null,
        );
        if (!inspected || durationDenial)
          throw new BadRequestException(
            durationDenial ?? 'Не удалось прочитать видео',
          );
        const stored = await this.uploads.storeStatusVideo(
          authorId,
          file,
          extension,
          inspected.poster,
        );
        if (!stored)
          throw new ServiceUnavailableException('Видео не сохранилось');
        media = {
          mediaKind: 'video',
          mediaUrl: stored.url,
          mediaKey: stored.key,
          posterUrl: stored.posterUrl,
          posterKey: stored.posterKey,
          width: inspected.info.width,
          height: inspected.info.height,
          durationSec: inspected.info.durationSec,
        };
      }
    }

    const created = await this.prisma.chatStatus.create({
      data: {
        authorId,
        text: content.text,
        ...media,
        createdAt: now,
        expiresAt: statusExpiresAt(now),
      },
    });
    return toStatusDto(
      { ...created, viewedByViewer: true, viewCount: 0 },
      authorId,
    );
  }

  /** Отметить просмотр. Свой статус не отмечается: автор его видел. */
  async view(viewerId: string, statusId: string, now = new Date()) {
    const status = await this.prisma.chatStatus.findFirst({
      where: { id: statusId, expiresAt: { gt: now } },
      select: { id: true, authorId: true },
    });
    if (!status) throw new NotFoundException('Статус не найден');
    if (status.authorId === viewerId) return { ok: true };
    const users = await this.visibleUsers(viewerId, [status.authorId]);
    if (!users.has(status.authorId))
      throw new NotFoundException('Статус не найден');
    await this.prisma.chatStatusView.upsert({
      where: { statusId_viewerId: { statusId, viewerId } },
      create: { statusId, viewerId },
      update: {},
    });
    return { ok: true };
  }

  /** Удалить свой статус раньше срока — вместе с файлами. */
  async remove(authorId: string, statusId: string) {
    const status = await this.prisma.chatStatus.findUnique({
      where: { id: statusId },
      select: { authorId: true, mediaKey: true, posterKey: true },
    });
    if (!status) throw new NotFoundException('Статус не найден');
    if (status.authorId !== authorId)
      throw new ForbiddenException('Удалить можно только свой статус');
    await this.prisma.chatStatus.delete({ where: { id: statusId } });
    await this.uploads.removeMany(
      [status.mediaKey, status.posterKey].filter((key): key is string =>
        Boolean(key),
      ),
    );
    return { ok: true };
  }

  /**
   * Истёкшие статусы — пачкой, с файлами. Зовёт `ChatRetentionService` на
   * своём тике: второй таймер и второй лиз ради одной выборки не нужны.
   */
  async purgeExpired(now = new Date(), batch = 500): Promise<number> {
    const expired = await this.prisma.chatStatus.findMany({
      where: { expiresAt: { lte: now } },
      select: { id: true, mediaKey: true, posterKey: true },
      orderBy: { expiresAt: 'asc' },
      take: batch,
    });
    if (expired.length === 0) return 0;
    await this.prisma.chatStatus.deleteMany({
      where: { id: { in: expired.map((status) => status.id) } },
    });
    await this.uploads.removeMany(
      expired
        .flatMap((status) => [status.mediaKey, status.posterKey])
        .filter((key): key is string => Boolean(key)),
    );
    return expired.length;
  }

  private async activeRows(
    viewerId: string,
    authorIds: string[] | undefined,
    now: Date,
  ): Promise<StatusRow[]> {
    const rows = await this.prisma.chatStatus.findMany({
      where: {
        expiresAt: { gt: now },
        ...(authorIds ? { authorId: { in: authorIds } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      include: {
        views: { where: { viewerId }, select: { viewerId: true } },
        _count: { select: { views: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      authorId: row.authorId,
      text: row.text,
      mediaKind: row.mediaKind,
      mediaUrl: row.mediaUrl,
      posterUrl: row.posterUrl,
      width: row.width,
      height: row.height,
      durationSec: row.durationSec,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      viewedByViewer: row.views.length > 0,
      viewCount: row._count.views,
    }));
  }

  /**
   * Кого смотрящему можно показать: живые аккаунты без блокировки в любую
   * сторону. Себя — всегда.
   */
  private async visibleUsers(
    viewerId: string,
    candidates: string[],
  ): Promise<Map<string, ChatUserSummary>> {
    const ids = [...new Set(candidates)];
    if (ids.length === 0) return new Map();
    const others = ids.filter((id) => id !== viewerId);
    const blocks = others.length
      ? await this.prisma.userBlock.findMany({
          where: {
            OR: [
              { blockerId: viewerId, blockedId: { in: others } },
              { blockedId: viewerId, blockerId: { in: others } },
            ],
          },
          select: { blockerId: true, blockedId: true },
        })
      : [];
    const blocked = new Set(
      blocks
        .flatMap((block) => [block.blockerId, block.blockedId])
        .filter((id) => id !== viewerId),
    );
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: ids.filter((id) => !blocked.has(id)) },
        OR: [{ id: viewerId }, { accountStatus: 'active' }],
      },
      select: chatUserSelect,
    });
    return new Map(users.map((user) => [user.id, toUserSummary(user)]));
  }
}
