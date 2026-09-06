import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  resolveDisplayName,
  type ChatMessageDto,
  type ChatMomentDto,
  type ChatMomentFeed,
  type ChatMomentRing,
  type ChatMomentSettingsState,
  type ChatMomentUploadResult,
  type ChatMomentViewersState,
  type ChatMomentsState,
  type PublishChatMomentRequest,
  type SaveChatMomentSettingsRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { PortalAccessService } from '../../access/access.service';
import { readBillingMode } from '../../billing/billing-mode';
import { ModerationService } from '../../moderation/moderation.service';
import { ChatEventsService } from '../chat-events.service';
import { ChatMessagesService } from '../chat-messages.service';
import { ChatConversationsService } from '../chat-conversations.service';
import { ChatUploadsService, type UploadedChatFile } from '../chat-uploads.service';
import { chatUserSelect } from '../chat-selects';
import { momentKeyPrefix } from '../chat-storage-scope';
import { ChatValidationError, isStorageUrl, normalizeMessageBody } from '../chat-validate';
import { denyMomentView, momentFanout } from './moments-access';
import {
  momentUploadKindFor,
  momentVideoExtension,
} from './moments-upload-rules';
import { denyDuration } from './moments-video';
import { MomentsVideoService } from './moments-video.service';
import {
  momentSnapshot,
  toMomentDto,
  toRing,
  type ChatMomentRow,
} from './moments-dto';
import { toUserSummary } from '../chat-dto';
import { dayStart, momentExpiresAt } from './moments-lifetime';
import {
  everyoneEnabled,
  momentsPlanOf,
  planNote,
  everyoneAllowed,
} from './moments-plan';
import {
  MomentValidationError,
  assertUnderDailyLimit,
  normalizePublish,
  remainingToday,
} from './moments-validate';
import { sortRings } from './moments-rings';

/**
 * Моменты: исчезающие через сутки фотографии и записки.
 *
 * Живут внутри «Общения», а не отдельным сервисом: аудиторию момента
 * составляют собеседники, отвечают на него обычной перепиской, а кольцо
 * рисуется в списке бесед. Наружу модуль не выходит — портальный граф
 * доступа спрашивается через `PortalAccessService`, блокировки и скрытия —
 * через `ModerationService`, обе службы портальные и разрешены контрактом.
 */
@Injectable()
export class MomentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PortalAccessService,
    private readonly moderation: ModerationService,
    private readonly events: ChatEventsService,
    private readonly uploads: ChatUploadsService,
    private readonly conversations: ChatConversationsService,
    private readonly messages: ChatMessagesService,
    private readonly video: MomentsVideoService,
  ) {}

  /** Полоса колец над списком бесед. */
  async rings(viewerId: string, now = new Date()): Promise<ChatMomentsState> {
    const [authorIds, hidden] = await Promise.all([
      this.visibleAuthorIds(viewerId),
      this.hidden(viewerId),
    ]);

    // Два запроса вместо одного «или»: свои и близкие ограничены списком
    // авторов, а публичные — всем порталом, и без отдельного предела самый
    // свежий чужой момент вытеснил бы из выборки моменты собеседников.
    const near = await this.prisma.chatMoment.findMany({
      where: {
        expiresAt: { gt: now },
        authorId: { in: [viewerId, ...authorIds] },
      },
      include: { author: { select: chatUserSelect } },
      orderBy: { createdAt: 'desc' },
      take: NEAR_MOMENTS_LIMIT,
    });

    const publicRows = await this.prisma.chatMoment.findMany({
      where: {
        expiresAt: { gt: now },
        audience: 'everyone',
        authorId: { notIn: [viewerId, ...authorIds, ...hidden] },
      },
      include: { author: { select: chatUserSelect } },
      orderBy: { createdAt: 'desc' },
      take: PUBLIC_MOMENTS_LIMIT,
    });

    const moments = [...near, ...publicRows];
    const seen = await this.seenIds(
      viewerId,
      moments.map((moment) => moment.id),
    );

    const byAuthor = new Map<string, ChatMomentRow[]>();
    for (const moment of moments) {
      const list = byAuthor.get(moment.authorId) ?? [];
      list.push(moment);
      byAuthor.set(moment.authorId, list);
    }

    const rings: ChatMomentRing[] = [];
    for (const list of byAuthor.values())
      rings.push(toRing(list[0]!.author, viewerId, list, seen));

    return {
      rings: sortRings(rings),
      remainingToday: remainingToday(await this.publishedToday(viewerId, now)),
    };
  }

  /** Моменты одного человека — то, что открывает просмотрщик. */
  async feed(
    viewerId: string,
    authorId: string,
    now = new Date(),
  ): Promise<ChatMomentFeed> {
    const author = await this.prisma.user.findUnique({
      where: { id: authorId },
      select: chatUserSelect,
    });
    if (!author) throw new NotFoundException('Моменты не найдены');

    const facts = await this.facts(viewerId, authorId);
    const rows = await this.prisma.chatMoment.findMany({
      where: { authorId, expiresAt: { gt: now } },
      include: { author: { select: chatUserSelect } },
      orderBy: { createdAt: 'asc' },
    });

    const visible = rows.filter(
      (row) =>
        denyMomentView(row.audience, { ...facts, expired: false }) === null,
    );
    // Пустая лента и закрытая лента отвечают одинаково: иначе перебором
    // идентификаторов выясняется, кому человек открыл доступ.
    if (visible.length === 0) throw new NotFoundException('Моменты не найдены');

    const seen = await this.seenIds(
      viewerId,
      visible.map((row) => row.id),
    );

    return {
      author: toUserSummary(author),
      mine: authorId === viewerId,
      moments: visible.map((row) =>
        toMomentDto(row, viewerId, seen.has(row.id)),
      ),
    };
  }

  /**
   * Загрузка фотографии или ролика: адрес возвращается браузеру и приезжает
   * обратно в публикацию.
   *
   * У ролика сервер сам снимает постер и меряет длительность. Верить числу
   * из браузера нельзя: по нему считается полоска прогресса и проверяется
   * предел, а подменить его в запросе — одна строка в консоли.
   */
  async upload(
    userId: string,
    file: UploadedChatFile | undefined,
  ): Promise<ChatMomentUploadResult> {
    if (!file) throw new BadRequestException('Файл не пришёл');
    if (!this.uploads.configured)
      throw new ServiceUnavailableException('Загрузка файлов не настроена');

    const kind = momentUploadKindFor(file.mimetype);
    if (!kind) throw new BadRequestException('Такие файлы не принимаем');
    if (kind === 'video') return this.uploadVideo(userId, file);

    const stored = await this.uploads.storeMomentImage(userId, file);
    if (!stored) throw new BadRequestException('Такие файлы не принимаем');

    return {
      kind: 'photo',
      url: stored.url,
      width: stored.width ?? null,
      height: stored.height ?? null,
    };
  }

  private async uploadVideo(
    userId: string,
    file: UploadedChatFile,
  ): Promise<ChatMomentUploadResult> {
    const extension = momentVideoExtension(file.mimetype);
    const inspected = await this.video.inspect(file.buffer, extension);
    if (!inspected)
      throw new BadRequestException(
        'Не удалось прочитать ролик — попробуйте другой файл',
      );

    const denial = denyDuration(inspected.probe.durationSec);
    if (denial) throw new BadRequestException(denial);

    const stored = await this.uploads.storeMomentVideo(
      userId,
      file,
      inspected.poster,
      extension,
      inspected.probe.durationSec,
    );
    if (!stored) throw new BadRequestException('Ролик не сохранён');

    return {
      kind: 'video',
      url: stored.url,
      previewUrl: stored.previewUrl,
      durationSec: inspected.probe.durationSec,
      width: inspected.probe.width,
      height: inspected.probe.height,
    };
  }

  async publish(
    userId: string,
    dto: PublishChatMomentRequest,
    now = new Date(),
  ): Promise<ChatMomentDto> {
    const allowEveryone = (await this.settings(userId)).showToEveryone;
    const input = this.validated(() => normalizePublish(dto, allowEveryone));
    const publishedToday = await this.publishedToday(userId, now);
    this.validated(() => assertUnderDailyLimit(publishedToday));

    // Адрес обязан вести в свою папку моментов. Проверка здесь, а не в чистом
    // модуле: там нет ни префикса бакета, ни знания о том, кто публикует.
    if (
      input.url &&
      !isStorageUrl(input.url, this.uploads.storagePrefix, NO_CONVERSATION, [
        momentKeyPrefix(userId),
      ])
    )
      throw new BadRequestException(
        input.kind === 'video'
          ? 'Ролик не из нашего хранилища'
          : 'Фотография не из нашего хранилища',
      );

    // Постер и длительность ролика сервер знает сам — из своего же объекта в
    // бакете, а не из запроса: у постера предсказуемое имя, и подсунуть чужой
    // адрес вместо него нельзя.
    const video =
      input.kind === 'video'
        ? await this.videoFacts(input.url!)
        : null;

    const created = await this.prisma.chatMoment.create({
      data: {
        authorId: userId,
        kind: input.kind,
        audience: input.audience,
        caption: input.caption || null,
        url: input.url,
        key: input.url ? this.keyOf(input.url) : null,
        previewUrl: video?.previewUrl ?? null,
        previewKey: video?.previewKey ?? null,
        durationSec: video?.durationSec ?? null,
        mimeType: video?.mimeType ?? null,
        width: input.width,
        height: input.height,
        background: input.background,
        expiresAt: momentExpiresAt(now),
      },
      include: { author: { select: chatUserSelect } },
    });

    await this.announce(created);
    return toMomentDto(created, userId, true);
  }

  async remove(userId: string, momentId: string): Promise<{ ok: true }> {
    const moment = await this.prisma.chatMoment.findUnique({
      where: { id: momentId },
      select: { id: true, authorId: true, audience: true },
    });
    if (!moment || moment.authorId !== userId)
      throw new NotFoundException('Момент не найден');

    // Сгорание задним числом вместо удаления строки: видимость всюду решает
    // одно условие `expiresAt > now`, и «убрал автор» не должно быть вторым.
    // Строку и файл уберёт уборщик — он же проверит, не переехал ли объект
    // снимком в чужую переписку.
    await this.prisma.chatMoment.update({
      where: { id: momentId },
      data: { expiresAt: new Date(0) },
    });

    const audience = await this.audienceIds(userId);
    const event = {
      type: 'moment.removed' as const,
      momentId,
      authorId: userId,
    };
    // Автору — всегда: у него может быть открыта вторая вкладка. Остальным —
    // по тем же правилам, что и о публикации.
    this.events.publish([userId], event);
    const others = momentFanout(moment.audience, audience);
    if (others.length > 0) this.events.publish(others, event);
    return { ok: true };
  }

  /** Отметка просмотра. Ставится только тем, кто и так видит момент. */
  async markViewed(
    viewerId: string,
    momentId: string,
    now = new Date(),
  ): Promise<{ ok: true }> {
    const moment = await this.requireVisible(viewerId, momentId, now);
    if (moment.authorId === viewerId) return { ok: true };

    // Счётчик двигается только вместе с новой строкой просмотра: повторное
    // открытие ленты иначе накручивало бы число.
    const created = await this.prisma.chatMomentView
      .create({ data: { momentId, userId: viewerId } })
      .catch(() => null);
    if (created)
      await this.prisma.chatMoment.update({
        where: { id: momentId },
        data: { viewsCount: { increment: 1 } },
      });

    return { ok: true };
  }

  /** Кто посмотрел. Только автору: смотревшие друг о друге не знают. */
  async viewers(
    userId: string,
    momentId: string,
  ): Promise<ChatMomentViewersState> {
    const moment = await this.prisma.chatMoment.findUnique({
      where: { id: momentId },
      select: { id: true, authorId: true, viewsCount: true },
    });
    if (!moment) throw new NotFoundException('Момент не найден');
    if (moment.authorId !== userId)
      throw new ForbiddenException('Список смотревших виден только автору');

    const rows = await this.prisma.chatMomentView.findMany({
      where: { momentId },
      include: { user: { select: chatUserSelect } },
      orderBy: { createdAt: 'desc' },
      take: VIEWERS_LIMIT,
    });

    return {
      viewsCount: moment.viewsCount,
      viewers: rows.map((row) => ({
        user: {
          id: row.user.id,
          name: resolveDisplayName(row.user),
          avatarUrl: row.user.avatarUrl,
          lastSeenAt: row.user.lastSeenAt?.toISOString() ?? null,
        },
        viewedAt: row.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Ответ на момент — обычное личное сообщение со снимком момента.
   *
   * Не отдельная сущность: у автора один почтовый ящик, а не два, и на ответ
   * сами собой распространяются запрос на переписку, блокировка и жалоба.
   */
  async reply(
    viewerId: string,
    momentId: string,
    body: string,
    now = new Date(),
  ): Promise<ChatMessageDto> {
    const moment = await this.requireVisible(viewerId, momentId, now);
    if (moment.authorId === viewerId)
      throw new BadRequestException('Это ваш момент');

    const text = this.validatedMessage(() => normalizeMessageBody(body));
    if (!text) throw new BadRequestException('Ответ пустой');

    const conversation = await this.conversations.create(viewerId, {
      kind: 'direct',
      userId: moment.authorId,
    });

    return this.messages.send(
      viewerId,
      conversation.id,
      {
        body: text,
        attachments: [momentSnapshot(moment, resolveDisplayName(moment.author))],
      },
      conversation.id,
      [momentKeyPrefix(moment.authorId)],
    );
  }

  async settings(userId: string): Promise<ChatMomentSettingsState> {
    const [row, user, billingMode] = await Promise.all([
      this.prisma.chatMomentSettings.findUnique({ where: { userId } }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { subscriptionPaidUntil: true },
      }),
      readBillingMode(this.prisma),
    ]);

    const plan = momentsPlanOf(
      billingMode,
      user?.subscriptionPaidUntil ?? null,
    );
    return {
      showToEveryone: everyoneEnabled(row?.showToEveryone ?? null, plan),
      everyoneAllowed: everyoneAllowed(plan),
      planNote: planNote(plan),
    };
  }

  async saveSettings(
    userId: string,
    dto: SaveChatMomentSettingsRequest,
  ): Promise<ChatMomentSettingsState> {
    const showToEveryone = Boolean(dto.showToEveryone);
    await this.prisma.chatMomentSettings.upsert({
      where: { userId },
      create: { userId, showToEveryone },
      update: { showToEveryone },
    });

    // Выключение действует и на уже опубликованное: иначе «убрать из общего
    // доступа» не убирало бы ровно то, ради чего галочку снимали. Включение
    // задним числом не действует — момент, опубликованный для собеседников,
    // публикуют для них, а не «пока не передумаю».
    if (!showToEveryone)
      await this.prisma.chatMoment.updateMany({
        where: {
          authorId: userId,
          audience: 'everyone',
          expiresAt: { gt: new Date() },
        },
        data: { audience: 'contacts' },
      });

    return this.settings(userId);
  }

  /**
   * Момент виден смотрящему — иначе «не найден». Наружу нужен жалобам:
   * принимать жалобу на то, чего человек не видит, значит дать способ
   * перебором выяснить, что у кого опубликовано.
   */
  async assertVisible(
    viewerId: string,
    momentId: string,
    now = new Date(),
  ): Promise<void> {
    await this.requireVisible(viewerId, momentId, now);
  }

  /* ===== Внутреннее ===== */

  /** Сколько моментов человек опубликовал за последние сутки. */
  private async publishedToday(userId: string, now: Date): Promise<number> {
    return this.prisma.chatMoment.count({
      where: { authorId: userId, createdAt: { gte: dayStart(now) } },
    });
  }

  private async hidden(viewerId: string): Promise<Set<string>> {
    return this.moderation.hiddenUserIds(viewerId);
  }

  /** Чьи моменты «для собеседников» видит смотрящий. */
  private async visibleAuthorIds(viewerId: string): Promise<string[]> {
    const [granters, companions, hidden] = await Promise.all([
      this.access.grantersFor(viewerId),
      this.companionIds(viewerId),
      this.hidden(viewerId),
    ]);
    const ids = new Set([
      ...granters.map((row) => row.granterId),
      ...companions,
    ]);
    for (const id of hidden) ids.delete(id);
    ids.delete(viewerId);
    return [...ids];
  }

  /** Кому видны моменты автора «для собеседников». */
  private async audienceIds(authorId: string): Promise<string[]> {
    const [grantees, companions, hidden] = await Promise.all([
      this.access.granteesOf(authorId),
      this.companionIds(authorId),
      this.hidden(authorId),
    ]);
    const ids = new Set([
      ...grantees.map((row) => row.granteeId),
      ...companions,
    ]);
    for (const id of hidden) ids.delete(id);
    ids.delete(authorId);
    return [...ids];
  }

  /** Собеседники живых личных диалогов. «Избранное» сюда не попадает. */
  private async companionIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.chatMember.findMany({
      where: {
        userId: { not: userId },
        leftAt: null,
        conversation: {
          kind: 'direct',
          savedForId: null,
          state: 'active',
          members: { some: { userId, leftAt: null } },
        },
      },
      select: { userId: true },
    });
    return [...new Set(rows.map((row) => row.userId))];
  }

  private async facts(viewerId: string, authorId: string) {
    if (viewerId === authorId)
      return {
        isAuthor: true,
        isGrantee: false,
        isCompanion: false,
        hidden: false,
      };

    const [isGrantee, companions, hidden] = await Promise.all([
      this.access.canSeeActivity(viewerId, authorId),
      this.companionIds(viewerId),
      this.hidden(viewerId),
    ]);

    return {
      isAuthor: false,
      isGrantee,
      isCompanion: companions.includes(authorId),
      hidden: hidden.has(authorId),
    };
  }

  private async requireVisible(
    viewerId: string,
    momentId: string,
    now: Date,
  ): Promise<ChatMomentRow> {
    const moment = await this.prisma.chatMoment.findUnique({
      where: { id: momentId },
      include: { author: { select: chatUserSelect } },
    });
    if (!moment) throw new NotFoundException('Момент не найден');

    const facts = await this.facts(viewerId, moment.authorId);
    const denial = denyMomentView(moment.audience, {
      ...facts,
      expired: moment.expiresAt.getTime() <= now.getTime(),
    });
    // Все три причины отказа наружу одинаковы: разные ответы позволяли бы
    // выяснить перебором, публиковал ли человек что-нибудь.
    if (denial) throw new NotFoundException('Момент не найден');
    return moment;
  }

  private async seenIds(
    viewerId: string,
    momentIds: readonly string[],
  ): Promise<Set<string>> {
    if (momentIds.length === 0) return new Set();
    const rows = await this.prisma.chatMomentView.findMany({
      where: { userId: viewerId, momentId: { in: [...momentIds] } },
      select: { momentId: true },
    });
    return new Set(rows.map((row) => row.momentId));
  }

  /**
   * Сообщить о новом моменте. Кольцо собирается дважды, а не на каждого
   * получателя: у чужих оно одинаковое (момент новый, значит непросмотренный),
   * и различается только признак «мой».
   */
  private async announce(moment: ChatMomentRow): Promise<void> {
    const nobodySeenYet = new Set<string>();
    this.events.publish([moment.authorId], {
      type: 'moment.published',
      ring: toRing(moment.author, moment.authorId, [moment], nobodySeenYet),
    });

    const audience = await this.audienceIds(moment.authorId);
    const others = momentFanout(moment.audience, audience);
    if (others.length === 0) return;
    this.events.publish(others, {
      type: 'moment.published',
      ring: toRing(moment.author, OTHER_VIEWER, [moment], nobodySeenYet),
    });
  }

  /**
   * Постер и длительность ролика по его адресу.
   *
   * Постер лежит рядом с роликом под тем же именем и расширением `.webp` —
   * так его положила загрузка. Длительность перемеряем: между загрузкой и
   * публикацией браузер мог прислать что угодно.
   */
  private async videoFacts(url: string): Promise<{
    previewUrl: string;
    previewKey: string;
    durationSec: number | null;
    mimeType: string;
  }> {
    const key = this.keyOf(url);
    if (!key) throw new BadRequestException('Ролик не из нашего хранилища');

    const previewKey = key.replace(/\.[A-Za-z0-9]+$/, '.webp');
    if (previewKey === key)
      throw new BadRequestException('У ролика нет постера');

    // Объект должен существовать и быть нашим: несуществующий ключ означает,
    // что публикуют не то, что грузили, — например, чужой адрес наугад.
    const meta = await this.uploads.momentVideoMeta(key);
    if (!meta) throw new BadRequestException('Ролик не найден в хранилище');

    return {
      previewUrl: url.slice(0, url.length - key.length) + previewKey,
      previewKey,
      durationSec: meta.durationSec,
      mimeType: key.endsWith('.webm') ? 'video/webm' : 'video/mp4',
    };
  }

  /** Ключ объекта в бакете по его адресу. */
  private keyOf(url: string): string | null {
    const prefix = this.uploads.storagePrefix;
    if (!prefix || !url.startsWith(prefix)) return null;
    return decodeURIComponent(url.slice(prefix.length)) || null;
  }

  private validated<T>(run: () => T): T {
    try {
      return run();
    } catch (error) {
      if (error instanceof MomentValidationError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }

  private validatedMessage<T>(run: () => T): T {
    try {
      return run();
    } catch (error) {
      if (error instanceof ChatValidationError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }
}

/**
 * Сколько моментов забирает полоса колец у своих и близких. Полоса показывает
 * счётчики, а не содержимое: пятисот строк на полсотни авторов хватает с
 * запасом, а невыбранный хвост в кольце всё равно не виден.
 */
const NEAR_MOMENTS_LIMIT = 500;

/**
 * Сколько публичных моментов попадает в полосу. Предел отдельный: без него
 * весь портал вытеснил бы из выборки моменты собеседников, ради которых
 * полосу и открывают.
 */
const PUBLIC_MOMENTS_LIMIT = 100;

/** Заведомо не совпадающий ни с кем идентификатор: кольцо «не моё». */
const OTHER_VIEWER = '-';

/** Столько имён помещается в лист «кто посмотрел». */
const VIEWERS_LIMIT = 200;

/**
 * Момент не принадлежит беседе, а `isStorageUrl` начинает с её папки.
 * Заведомо несуществующий идентификатор оставляет в разрешённых ровно одну
 * папку — папку моментов автора.
 */
const NO_CONVERSATION = '-';
