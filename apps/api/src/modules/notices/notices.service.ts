import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, type NoticeStatus } from '@prisma/client';
import {
  MAX_IMAGES_PER_NOTICE,
  PORTAL_ACTIVITY_EVENTS,
  NOTICES_PER_DAY,
  type CreateNoticeRequest,
  type NoticeDto,
  type NoticeCalendarResponse,
  type NoticeFeedResponse,
  type NoticeAudience,
  type NoticeMapResponse,
  type NoticeOccurrenceDto,
  type NoticeImageUploadFailure,
  type NoticeImageUploadResponse,
  type NoticeRubricsResponse,
  type PortalActivityEvent,
  type ProfileLocation,
  type ReorderNoticeImagesRequest,
  type UpdateNoticeRequest,
  type UpdateNoticeStatusRequest,
} from '@vedamatch/shared';
import { normalizeCityKey } from '../../common/city-key';
import { PrismaService } from '../../prisma/prisma.service';
import { CommunitiesService } from '../communities/communities.service';
import { ModerationService } from '../moderation/moderation.service';
import {
  NOTICE_INCLUDE,
  toImageDto,
  toNoticeDto,
  toRubricDto,
} from './notice-dto';
import { canRenew, renewedExpiresAt, resolveExpiresAt } from './notice-expiry';
import {
  buildFeedWhere,
  cursorFilter,
  decodeCursor,
  encodeCursor,
  feedOrderBy,
  type FeedViewer,
  type NormalizedFeedFilters,
} from './notice-feed-query';
import { buildIcs, formatUtc } from './build-ics';
import { hasEkadashiCalendar } from './ekadashi-dates';
import { expandOccurrences } from './notice-event-occurrences';
import { detectCommerce, needsReview } from './notice-commerce-guard';
import {
  MAP_POINTS_CAP,
  boundsWhere,
  coordsForPrecision,
  parseBounds,
  parseRadius,
  radiusIdsSql,
  resolveMapMode,
} from './notice-geo';
import { noticeFingerprint } from './notice-fingerprint';
import { recountRubric } from './notice-rubric-count';
import {
  NoticeImagesService,
  type UploadedImageFile,
} from './notice-images.service';
import { NoticesSubscriptionsService } from './notices-subscriptions.service';
import {
  NOTICE_VALIDATION_MESSAGES,
  parseDate,
  validateNotice,
} from './notice-validate';

/**
 * Сколько событий берём в календарь за раз. Каждое разворачивается в
 * несколько вхождений, поэтому потолок стоит на записях, а не на датах.
 */
const CALENDAR_NOTICES_CAP = 200;

/** Статусы, в которые автор может перевести объявление сам. */
const AUTHOR_STATUS_TARGETS: ReadonlySet<string> = new Set<
  UpdateNoticeStatusRequest['status']
>(['published', 'hidden_by_author', 'resolved', 'draft']);

/** Статусы, из которых выводит только администратор. */
const LOCKED_STATUSES: ReadonlySet<NoticeStatus> = new Set<NoticeStatus>([
  'hidden_by_reports',
  'removed_by_admin',
  'moved_to_market',
]);

@Injectable()
export class NoticesService {
  constructor(
    private readonly prisma: PrismaService,
    // Портальная инфраструктура, импортировать разрешено — см.
    // docs/service-module-contract.md.
    private readonly communities: CommunitiesService,
    private readonly moderation: ModerationService,
    private readonly images: NoticeImagesService,
    private readonly subscriptions: NoticesSubscriptionsService,
    private readonly bus: EventEmitter2,
  ) {}

  /**
   * Факт «человек опубликовал объявление» для подписчиков портала. Отдельно
   * от `notices.notice.published`: то уведомление адресовано подписчикам
   * рубрики и несёт `recipientId`, а здесь важен автор.
   *
   * Событие самодостаточно, как требует контракт: заголовок и ссылка едут в
   * нём, потому что подписчик (лента друзей) не имеет права дочитать их из
   * таблиц Объявлений.
   *
   * Объявления с сужённой аудиторией в шину не идут. Лента друзей не знает
   * ни города зрителя, ни его общин, а проверить это ей негде: карточка
   * «Нужны руки на переезд» привела бы человека из другой ятры на чужую
   * запись, которую он и открыть не может. Издатель решает сам — это его
   * знание, а не подписчика.
   */
  private announceActivity(
    userId: string,
    notice: { id: string; title: string | null; audience: NoticeAudience },
  ): void {
    if (notice.audience !== 'everyone') return;
    const event: PortalActivityEvent = {
      name: PORTAL_ACTIVITY_EVENTS.notices,
      userId,
      action: 'notices.notice-created',
      occurredAt: new Date().toISOString(),
      entityId: notice.id,
      entityLabel: notice.title ?? undefined,
      link: `/notices/${notice.id}`,
    };
    this.bus.emit(event.name, event);
  }

  // ===== Каталог =====

  async rubrics(): Promise<NoticeRubricsResponse> {
    const items = await this.prisma.noticeRubric.findMany({
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
    return { items: items.map(toRubricDto) };
  }

  // ===== Лента =====

  /**
   * Идентификаторы внутри радиуса. Отдельным шагом, а не условием в `where`:
   * гаверсинус в билдер Prisma не выражается, а фильтровать после выборки
   * нельзя — это дырявит курсорную пагинацию.
   */
  async resolveRadius(
    query: Record<string, string | undefined>,
  ): Promise<string[] | null> {
    const radius = parseRadius(query);
    if (!radius) return null;
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(
      radiusIdsSql(radius, new Date()),
    );
    return rows.map((row) => row.id);
  }

  async feed(
    filters: NormalizedFeedFilters,
    viewerId: string,
    isAdmin: boolean,
  ): Promise<NoticeFeedResponse> {
    const now = new Date();
    const viewer = await this.resolveViewer(viewerId, isAdmin);
    const cursor = decodeCursor(filters.cursor);
    const where = buildFeedWhere(filters, viewer, now);

    const rows = await this.prisma.notice.findMany({
      where: cursor ? { AND: [where, cursorFilter(cursor)] } : where,
      include: NOTICE_INCLUDE,
      orderBy: feedOrderBy(),
      // Берём на одну больше страницы: наличие «хвоста» и есть признак
      // следующей страницы, отдельный count по тому же условию не нужен.
      take: filters.limit + 1,
    });

    const hasMore = rows.length > filters.limit;
    const page = hasMore ? rows.slice(0, filters.limit) : rows;
    const last = page.at(-1);
    return {
      items: page.map((row) => toNoticeDto(row, viewer.userId, now)),
      nextCursor: hasMore && last ? encodeCursor(last) : null,
    };
  }

  async byId(
    id: string,
    viewerId: string,
    isAdmin: boolean,
  ): Promise<NoticeDto> {
    const now = new Date();
    const row = await this.prisma.notice.findUnique({
      where: { id },
      include: NOTICE_INCLUDE,
    });
    if (!row) throw new NotFoundException('Объявление не найдено');

    const viewer = await this.resolveViewer(viewerId, isAdmin);
    if (!this.mayView(row, viewer, now)) {
      // 404, а не 403: 403 подтверждает существование скрытой записи.
      throw new NotFoundException('Объявление не найдено');
    }

    // Счётчик просмотров не считает автора: иначе он накрутит его сам,
    // просто заглядывая в своё объявление.
    if (viewer.userId !== row.authorId) {
      await this.prisma.notice.update({
        where: { id },
        data: { viewsCount: { increment: 1 } },
      });
    }
    return toNoticeDto(row, viewer.userId, now);
  }

  /**
   * Карта. Условие видимости то же, что в ленте: карта не должна показывать
   * то, чего в ленте нет, — иначе закрытое объявление общины утекло бы
   * меткой.
   */
  async map(
    filters: NormalizedFeedFilters,
    query: Record<string, string | undefined>,
    viewerId: string,
    isAdmin: boolean,
  ): Promise<NoticeMapResponse> {
    const now = new Date();
    const viewer = await this.resolveViewer(viewerId, isAdmin);
    const bounds = parseBounds(query);
    const base = buildFeedWhere(filters, viewer, now);
    const where: Prisma.NoticeWhereInput = bounds
      ? { AND: [base, boundsWhere(bounds)] }
      : base;

    const [matches, withoutLocation] = await Promise.all([
      this.prisma.notice.count({
        where: { AND: [where, { latitude: { not: null } }] },
      }),
      this.prisma.notice.count({
        where: { AND: [base, { latitude: null }] },
      }),
    ]);

    if (resolveMapMode(matches, Number(query.zoom)) === 'points') {
      const rows = await this.prisma.notice.findMany({
        where: { AND: [where, { latitude: { not: null } }] },
        select: {
          id: true,
          titleRu: true,
          titleEn: true,
          kind: true,
          latitude: true,
          longitude: true,
          placePrecision: true,
        },
        take: MAP_POINTS_CAP,
      });
      return {
        mode: 'points',
        // Огрубление повторяется и на чтении: страхует записи, созданные
        // до снапа на записи, и любые пути, где координаты попали в базу
        // мимо locationColumns.
        points: rows.map((row) => {
          const { lat, lon } = coordsForPrecision(
            row.latitude!,
            row.longitude!,
            row.placePrecision,
          );
          return {
            id: row.id,
            title: row.titleRu ?? row.titleEn ?? 'Без названия',
            kind: row.kind,
            lat,
            lon,
            precision: row.placePrecision,
          };
        }),
        withoutLocation,
      };
    }

    // Агрегат по городу. Координаты берутся минимальные по группе, а не
    // средние: у объявлений одного города они и так совпадают (центроид из
    // геокодера), а среднее по разным точкам уехало бы в поле между ними.
    const grouped = await this.prisma.notice.groupBy({
      by: ['city', 'country'],
      where: {
        AND: [where, { latitude: { not: null } }, { city: { not: null } }],
      },
      _count: { _all: true },
      _min: { latitude: true, longitude: true },
      orderBy: { _count: { id: 'desc' } },
      take: 500,
    });
    return {
      mode: 'clusters',
      clusters: grouped
        .filter((row) => row._min.latitude !== null && row.city !== null)
        .map((row) => ({
          city: row.city!,
          country: row.country,
          lat: row._min.latitude!,
          lon: row._min.longitude!,
          count: row._count._all,
        })),
      withoutLocation,
    };
  }

  /**
   * Календарь: события окна с развёрнутыми повторами.
   *
   * Условие видимости то же, что в ленте: календарь не должен показывать то,
   * чего в ленте нет.
   */
  async calendar(
    filters: NormalizedFeedFilters,
    query: Record<string, string | undefined>,
    viewerId: string,
    isAdmin: boolean,
  ): Promise<NoticeCalendarResponse> {
    const now = new Date();
    const from = parseDate(query.from) ?? now;
    const to = parseDate(query.to) ?? new Date(now.getTime() + 90 * 86_400_000);
    const viewer = await this.resolveViewer(viewerId, isAdmin);

    const rows = await this.prisma.notice.findMany({
      where: {
        AND: [
          buildFeedWhere(filters, viewer, now),
          { kind: 'event' },
          { startsAt: { not: null } },
          // Повторяющееся событие могло начаться задолго до окна — отсекать
          // по `startsAt` нельзя, иначе воскресная программа пропадёт из
          // календаря на второй неделе. Отсекаем по концу повтора.
          { OR: [{ repeatUntil: null }, { repeatUntil: { gte: from } }] },
          { OR: [{ repeat: { not: 'none' } }, { startsAt: { lte: to } }] },
        ],
      },
      include: NOTICE_INCLUDE,
      take: CALENDAR_NOTICES_CAP,
    });

    const items: NoticeOccurrenceDto[] = [];
    for (const row of rows) {
      if (!row.startsAt) continue;
      const occurrences = expandOccurrences(
        {
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          repeat: row.repeat,
          repeatUntil: row.repeatUntil,
          timeZone: row.timeZone,
        },
        from,
        to,
      );
      for (const occurrence of occurrences) {
        items.push({
          noticeId: row.id,
          title: row.titleRu ?? row.titleEn ?? 'Без названия',
          rubricSlug: row.rubric.slug,
          startsAt: occurrence.startsAt.toISOString(),
          endsAt: occurrence.endsAt?.toISOString() ?? null,
          timeZone: row.timeZone,
          venueName: row.venueName,
          city: row.city,
          isOnline: row.isOnline,
          communityName: row.community?.name ?? null,
        });
      }
    }
    items.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return { items, ekadashiAvailable: hasEkadashiCalendar() };
  }

  /** Один `.ics` на объявление: разовое событие или все вхождения повтора. */
  async ics(
    id: string,
    viewerId: string,
    isAdmin: boolean,
    publicUrl: string,
  ): Promise<string> {
    const now = new Date();
    const row = await this.prisma.notice.findUnique({
      where: { id },
      include: NOTICE_INCLUDE,
    });
    if (!row || !row.startsAt)
      throw new NotFoundException('Событие не найдено');
    const viewer = await this.resolveViewer(viewerId, isAdmin);
    if (!this.mayView(row, viewer, now))
      throw new NotFoundException('Событие не найдено');

    const occurrences = expandOccurrences(
      {
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        repeat: row.repeat,
        repeatUntil: row.repeatUntil,
        timeZone: row.timeZone,
      },
      now,
      row.repeatUntil ?? new Date(now.getTime() + 365 * 86_400_000),
    );
    // Прошедшее разовое событие всё равно отдаём: человек мог сохранять его
    // задним числом, и пустой файл выглядел бы поломкой.
    const list = occurrences.length
      ? occurrences
      : [{ startsAt: row.startsAt, endsAt: row.endsAt }];

    const title = row.titleRu ?? row.titleEn ?? 'Событие';
    const place = [row.venueName, row.city].filter(Boolean).join(', ');
    return buildIcs(
      list.map((occurrence) => ({
        // UID стабилен между выгрузками: календарь обновит событие, а не
        // добавит второе.
        uid: `${row.id}-${formatUtc(occurrence.startsAt)}@vedamatch`,
        title,
        description: row.descriptionRu ?? row.descriptionEn,
        location: row.isOnline ? (row.onlineUrl ?? 'Онлайн') : place || null,
        url: `${publicUrl.replace(/\/$/, '')}/notices/${row.id}`,
        startsAt: occurrence.startsAt,
        endsAt: occurrence.endsAt,
        createdAt: row.createdAt,
      })),
      now,
    );
  }

  // ===== Создание и правка =====

  async create(userId: string, body: CreateNoticeRequest): Promise<NoticeDto> {
    this.assertValid(body, true);
    const rubric = await this.requireRubric(body.rubricSlug);
    await this.assertCommunityRight(userId, body.communityId ?? null);
    await this.assertDailyLimit(userId);

    const now = new Date();
    const startsAt = parseDate(body.startsAt);
    const endsAt = parseDate(body.endsAt);
    const fingerprint = noticeFingerprint({
      kind: body.kind,
      rubricId: rubric.id,
      title: body.titleRu ?? body.titleEn,
      description: body.descriptionRu ?? body.descriptionEn,
    });
    await this.assertNoDuplicate(userId, fingerprint, now, null);

    const created = await this.prisma.notice.create({
      data: {
        kind: body.kind,
        rubricId: rubric.id,
        authorId: userId,
        communityId: body.communityId ?? null,
        titleRu: trimOrNull(body.titleRu),
        titleEn: trimOrNull(body.titleEn),
        descriptionRu: trimOrNull(body.descriptionRu),
        descriptionEn: trimOrNull(body.descriptionEn),
        audience: body.audience ?? 'everyone',
        ...this.locationColumns(body.location, body.communityId ?? null),
        startsAt,
        endsAt,
        timeZone: trimOrNull(body.timeZone),
        venueName: trimOrNull(body.venueName),
        isOnline: body.isOnline ?? false,
        onlineUrl: trimOrNull(body.onlineUrl),
        repeat: body.repeat ?? 'none',
        repeatUntil: parseDate(body.repeatUntil),
        fingerprint,
        // Публикацию не блокируем: ложное срабатывание на «отдам даром,
        // забрать до 18:00» не должно молча съедать объявление. Пометка
        // отправляет его в очередь модератора, и только.
        needsReview: needsReview(
          detectCommerce(
            body.titleRu ?? body.titleEn,
            body.descriptionRu ?? body.descriptionEn,
          ),
        ),
        expiresAt: resolveExpiresAt({ kind: body.kind, startsAt, endsAt }, now),
      },
      include: NOTICE_INCLUDE,
    });
    await this.recountRubric(rubric.id);
    // Оповещение подписчиков не должно удлинять ответ на публикацию и уж тем
    // более ронять её: без await и с проглатыванием ошибки.
    void this.subscriptions
      .notifyPublished({
        id: created.id,
        title: created.titleRu ?? created.titleEn ?? 'Объявление',
        rubricSlug: rubric.slug,
        rubricName: rubric.nameRu,
        city: created.city,
        communityId: created.communityId,
        communityName: created.community?.name ?? null,
        authorId: userId,
        audience: created.audience,
      })
      .catch(() => undefined);
    this.announceActivity(userId, {
      id: created.id,
      title: created.titleRu ?? created.titleEn,
      audience: created.audience,
    });
    return toNoticeDto(created, userId, now);
  }

  async update(
    userId: string,
    isAdmin: boolean,
    id: string,
    body: UpdateNoticeRequest,
  ): Promise<NoticeDto> {
    this.assertValid(body, false);
    const notice = await this.requireOwn(id, userId, isAdmin);
    const rubric = body.rubricSlug
      ? await this.requireRubric(body.rubricSlug)
      : null;
    if (body.communityId !== undefined)
      await this.assertCommunityRight(userId, body.communityId ?? null);

    const now = new Date();
    const data: Prisma.NoticeUpdateInput = {};
    if (body.kind !== undefined) data.kind = body.kind;
    if (rubric) data.rubric = { connect: { id: rubric.id } };
    if (body.titleRu !== undefined) data.titleRu = trimOrNull(body.titleRu);
    if (body.titleEn !== undefined) data.titleEn = trimOrNull(body.titleEn);
    if (body.descriptionRu !== undefined)
      data.descriptionRu = trimOrNull(body.descriptionRu);
    if (body.descriptionEn !== undefined)
      data.descriptionEn = trimOrNull(body.descriptionEn);
    if (body.audience !== undefined) data.audience = body.audience;
    if (body.venueName !== undefined)
      data.venueName = trimOrNull(body.venueName);
    if (body.isOnline !== undefined) data.isOnline = body.isOnline;
    if (body.onlineUrl !== undefined)
      data.onlineUrl = trimOrNull(body.onlineUrl);
    if (body.timeZone !== undefined) data.timeZone = trimOrNull(body.timeZone);
    if (body.repeat !== undefined) data.repeat = body.repeat;
    if (body.repeatUntil !== undefined)
      data.repeatUntil = parseDate(body.repeatUntil);
    if (body.communityId !== undefined)
      data.community = body.communityId
        ? { connect: { id: body.communityId } }
        : { disconnect: true };
    if (body.location !== undefined)
      Object.assign(
        data,
        this.locationColumns(
          body.location,
          body.communityId !== undefined
            ? (body.communityId ?? null)
            : notice.communityId,
        ),
      );

    // Срок пересчитывается только когда поехала дата события: иначе правка
    // опечатки в заголовке продлевала бы объявление, обходя лимит продлений.
    const kind = body.kind ?? notice.kind;
    if (body.startsAt !== undefined || body.endsAt !== undefined) {
      const startsAt =
        body.startsAt !== undefined
          ? parseDate(body.startsAt)
          : notice.startsAt;
      const endsAt =
        body.endsAt !== undefined ? parseDate(body.endsAt) : notice.endsAt;
      data.startsAt = startsAt;
      data.endsAt = endsAt;
      data.expiresAt = resolveExpiresAt({ kind, startsAt, endsAt }, now);
    }

    const titleChanged =
      body.titleRu !== undefined ||
      body.titleEn !== undefined ||
      body.descriptionRu !== undefined ||
      body.descriptionEn !== undefined ||
      body.kind !== undefined ||
      rubric !== null;
    if (titleChanged) {
      // Текст поменялся — перепроверяем и на коммерцию: иначе «отдам даром»
      // можно было бы опубликовать, а потом дописать цену правкой.
      data.needsReview = needsReview(
        detectCommerce(
          body.titleRu ?? notice.titleRu ?? body.titleEn ?? notice.titleEn,
          body.descriptionRu ??
            notice.descriptionRu ??
            body.descriptionEn ??
            notice.descriptionEn,
        ),
      );
      data.fingerprint = noticeFingerprint({
        kind,
        rubricId: rubric?.id ?? notice.rubricId,
        title: body.titleRu ?? notice.titleRu ?? body.titleEn ?? notice.titleEn,
        description:
          body.descriptionRu ??
          notice.descriptionRu ??
          body.descriptionEn ??
          notice.descriptionEn,
      });
    }

    const updated = await this.prisma.notice.update({
      where: { id },
      data,
      include: NOTICE_INCLUDE,
    });
    if (rubric && rubric.id !== notice.rubricId) {
      await this.recountRubric(rubric.id);
      await this.recountRubric(notice.rubricId);
    }
    return toNoticeDto(updated, userId, now);
  }

  async setStatus(
    userId: string,
    isAdmin: boolean,
    id: string,
    body: UpdateNoticeStatusRequest,
  ): Promise<NoticeDto> {
    const notice = await this.requireOwn(id, userId, isAdmin);
    if (!AUTHOR_STATUS_TARGETS.has(body?.status))
      throw new BadRequestException('Недопустимый статус объявления');
    // Из-под модерации и из маркета автор сам не выходит: hidden_by_reports,
    // removed_by_admin и moved_to_market снимает только администратор.
    if (!isAdmin && LOCKED_STATUSES.has(notice.status))
      throw new ForbiddenException('notice_status_locked');
    const now = new Date();
    const data: Prisma.NoticeUpdateInput = { status: body.status };
    if (body.status === 'resolved') data.resolvedAt = now;
    if (body.status === 'published') {
      data.resolvedAt = null;
      // Возврат из «скрыто» и «решено» не должен воскрешать протухшее:
      // если срок вышел, публикация продлевает его на обычный срок.
      if (notice.expiresAt.getTime() <= now.getTime())
        data.expiresAt = renewedExpiresAt(notice.kind, now);
    }
    const updated = await this.prisma.notice.update({
      where: { id },
      data,
      include: NOTICE_INCLUDE,
    });
    await this.recountRubric(notice.rubricId);
    return toNoticeDto(updated, userId, now);
  }

  async renew(userId: string, id: string): Promise<NoticeDto> {
    const notice = await this.requireOwn(id, userId, false);
    const now = new Date();
    if (!canRenew(notice.expiresAt, now, notice.kind, notice.startsAt))
      throw new BadRequestException('Продлевать пока рано');

    const updated = await this.prisma.notice.update({
      where: { id },
      data: {
        expiresAt: renewedExpiresAt(notice.kind, now),
        renewedAt: now,
        renewCount: { increment: 1 },
        // Протухшее возвращается в ленту, а `publishedAt` НЕ трогаем: иначе
        // продление стало бы бесплатным подъёмом в топ.
        status: notice.status === 'expired' ? 'published' : notice.status,
      },
      include: NOTICE_INCLUDE,
    });
    return toNoticeDto(updated, userId, now);
  }

  async remove(userId: string, isAdmin: boolean, id: string): Promise<void> {
    const notice = await this.requireOwn(id, userId, isAdmin);
    const images = await this.prisma.noticeImage.findMany({
      where: { noticeId: id },
      select: { storageKey: true },
    });
    await this.prisma.notice.delete({ where: { id } });
    await this.images.removeMany(images.map((image) => image.storageKey));
    await this.recountRubric(notice.rubricId);
  }

  // ===== Картинки =====

  async uploadImages(
    userId: string,
    isAdmin: boolean,
    id: string,
    files: UploadedImageFile[],
  ): Promise<NoticeImageUploadResponse> {
    await this.requireOwn(id, userId, isAdmin);
    const existing = await this.prisma.noticeImage.findMany({
      where: { noticeId: id },
      orderBy: { sortOrder: 'asc' },
    });

    const failed: NoticeImageUploadFailure[] = [];
    if (!this.images.configured) {
      // Локально S3 обычно не настроен — это штатное состояние, а не ошибка:
      // отказ в загрузке не должен ронять всё остальное в форме.
      for (const [index] of files.entries())
        failed.push({
          fileName: `file-${index + 1}`,
          code: 'image_upload_unavailable',
          message: 'Загрузка картинок сейчас недоступна',
        });
      return { images: existing.map(toImageDto), failed };
    }

    let sortOrder = existing.length
      ? Math.max(...existing.map((image) => image.sortOrder)) + 1
      : 0;
    let total = existing.length;
    for (const [index, file] of files.entries()) {
      const fileName = `file-${index + 1}`;
      if (total >= MAX_IMAGES_PER_NOTICE) {
        failed.push({
          fileName,
          code: 'too_many_images',
          message: `Не больше ${MAX_IMAGES_PER_NOTICE} картинок`,
        });
        continue;
      }
      const invalid = this.images.validate(file);
      if (invalid) {
        failed.push({
          fileName,
          code: invalid,
          message:
            invalid === 'file_too_large'
              ? 'Файл больше 10 МБ'
              : 'Поддерживаются JPEG, PNG и WebP',
        });
        continue;
      }
      try {
        const stored = await this.images.storeNoticeImage(id, file);
        if (!stored) {
          failed.push({
            fileName,
            code: 'image_upload_unavailable',
            message: 'Загрузка картинок сейчас недоступна',
          });
          continue;
        }
        await this.prisma.noticeImage.create({
          data: {
            noticeId: id,
            storageKey: stored.key,
            url: stored.url,
            width: stored.width,
            height: stored.height,
            sizeBytes: stored.sizeBytes,
            sortOrder: sortOrder++,
          },
        });
        total += 1;
      } catch {
        failed.push({
          fileName,
          code: 'processing_failed',
          message: 'Не удалось обработать картинку',
        });
      }
    }

    const images = await this.syncPrimaryImage(id);
    return { images: images.map(toImageDto), failed };
  }

  async removeImage(
    userId: string,
    isAdmin: boolean,
    id: string,
    imageId: string,
  ): Promise<void> {
    await this.requireOwn(id, userId, isAdmin);
    const image = await this.prisma.noticeImage.findFirst({
      where: { id: imageId, noticeId: id },
    });
    if (!image) throw new NotFoundException('Картинка не найдена');
    await this.prisma.noticeImage.delete({ where: { id: imageId } });
    await this.images.remove(image.storageKey);
    await this.syncPrimaryImage(id);
  }

  async reorderImages(
    userId: string,
    isAdmin: boolean,
    id: string,
    body: ReorderNoticeImagesRequest,
  ): Promise<void> {
    await this.requireOwn(id, userId, isAdmin);
    const images = await this.prisma.noticeImage.findMany({
      where: { noticeId: id },
      select: { id: true },
    });
    const known = new Set(images.map((image) => image.id));
    // Порядок применяется целиком или никак: частично применённый список
    // оставил бы дырки в sortOrder и непредсказуемую обложку.
    if (
      body.imageIds.length !== known.size ||
      body.imageIds.some((imageId) => !known.has(imageId))
    )
      throw new BadRequestException('Список картинок не совпадает');

    await this.prisma.$transaction(
      body.imageIds.map((imageId, index) =>
        this.prisma.noticeImage.update({
          where: { id: imageId },
          data: { sortOrder: index },
        }),
      ),
    );
    await this.syncPrimaryImage(id);
  }

  // ===== Внутреннее =====

  /**
   * Может ли пользователь видеть объявление — по тому же правилу, что и
   * лента. Наружу для соседних сервисов модуля: отклик на объявление, которого
   * человек не видит (чужая община, чужой город, заблокированный автор), не
   * должен проходить только потому, что он угадал id. Бросает 404, а не 403 —
   * по той же причине, что и карточка.
   */
  async assertVisible(noticeId: string, viewerId: string): Promise<void> {
    const now = new Date();
    const row = await this.prisma.notice.findUnique({
      where: { id: noticeId },
      select: {
        authorId: true,
        status: true,
        expiresAt: true,
        audience: true,
        city: true,
        communityId: true,
      },
    });
    if (!row) throw new NotFoundException('Объявление не найдено');
    const viewer = await this.resolveViewer(viewerId, false);
    if (!this.mayView(row, viewer, now))
      throw new NotFoundException('Объявление не найдено');
  }

  private async resolveViewer(
    viewerId: string,
    isAdmin: boolean,
  ): Promise<FeedViewer> {
    const [user, memberships, hiddenUserIds] = await Promise.all([
      // Портальный профиль читается read-only — это разрешено контрактом.
      this.prisma.user.findUnique({
        where: { id: viewerId },
        select: { homeLocation: true },
      }),
      this.communities.membershipsOf(viewerId),
      // Скоуп `all`: у доски своего скоупа скрытий нет, действуют только
      // общие блокировки и скрытия «везде».
      this.moderation.hiddenUserIds(viewerId, 'all'),
    ]);
    const location = user?.homeLocation as { city?: string } | null;
    return {
      userId: viewerId,
      isAdmin,
      city: location?.city ?? null,
      communityIds: memberships.map((badge) => badge.id),
      hiddenUserIds,
    };
  }

  /** То же условие видимости, что и в ленте, но для одной записи. */
  private mayView(
    row: {
      authorId: string;
      status: string;
      expiresAt: Date;
      audience: string;
      city: string | null;
      communityId: string | null;
    },
    viewer: FeedViewer,
    now: Date,
  ): boolean {
    if (viewer.isAdmin) return true;
    if (row.authorId === viewer.userId) return true;
    // Заблокированный автор — 404, как и в ленте: блокировка действует во
    // всех сервисах сразу.
    if (viewer.hiddenUserIds.has(row.authorId)) return false;
    if (row.status !== 'published') return false;
    if (row.expiresAt.getTime() <= now.getTime()) return false;
    if (row.audience === 'everyone') return true;
    if (row.audience === 'my_city')
      return Boolean(
        viewer.city &&
        row.city &&
        viewer.city.toLowerCase() === row.city.toLowerCase(),
      );
    return Boolean(
      row.communityId && viewer.communityIds.includes(row.communityId),
    );
  }

  private assertValid(
    body: CreateNoticeRequest | UpdateNoticeRequest,
    isCreate: boolean,
  ) {
    const error = validateNotice(body, { isCreate });
    if (error) throw new BadRequestException(NOTICE_VALIDATION_MESSAGES[error]);
  }

  private async requireRubric(slug: string | null | undefined) {
    const rubric = slug
      ? await this.prisma.noticeRubric.findUnique({ where: { slug } })
      : null;
    if (!rubric) throw new BadRequestException('Рубрика не найдена');
    return rubric;
  }

  private async requireOwn(id: string, userId: string, isAdmin: boolean) {
    const notice = await this.prisma.notice.findUnique({ where: { id } });
    if (!notice) throw new NotFoundException('Объявление не найдено');
    if (notice.authorId !== userId && !isAdmin)
      throw new NotFoundException('Объявление не найдено');
    return notice;
  }

  /**
   * Право публиковать от имени общины перепроверяется на каждой правке, а не
   * только при создании: роль в общине могли снять, и объявление не должно
   * продолжать говорить от её имени.
   */
  private async assertCommunityRight(
    userId: string,
    communityId: string | null,
  ) {
    if (!communityId) return;
    const allowed = await this.communities.canPostAs(userId, communityId);
    if (!allowed)
      throw new ForbiddenException(
        'Публиковать от имени общины могут её владелец и администраторы',
      );
  }

  private async assertDailyLimit(userId: string) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const published = await this.prisma.notice.count({
      where: { authorId: userId, createdAt: { gte: since } },
    });
    if (published >= NOTICES_PER_DAY)
      throw new BadRequestException(
        `Не больше ${NOTICES_PER_DAY} объявлений в сутки`,
      );
  }

  /**
   * Дубль ищется по отпечатку среди живых объявлений того же автора: один
   * человек не публикует одно и то же дважды — ни по ошибке, ни ради подъёма
   * в ленте.
   */
  private async assertNoDuplicate(
    userId: string,
    fingerprint: string,
    now: Date,
    exceptId: string | null,
  ) {
    const clash = await this.prisma.notice.findFirst({
      where: {
        authorId: userId,
        fingerprint,
        status: { in: ['published', 'draft'] },
        expiresAt: { gt: now },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash)
      throw new BadRequestException(
        'Такое объявление у вас уже есть — продлите его вместо нового',
      );
  }

  /**
   * Гео. У объявления человека точность понижается до города принудительно:
   * это решает сервер, а не форма — клиент переопределить не может.
   * `exact` остаётся только у публикации от имени общины, где место
   * общественное.
   */
  private locationColumns(
    location: ProfileLocation | null | undefined,
    communityId: string | null,
  ) {
    if (!location)
      return {
        location: Prisma.DbNull,
        city: null,
        cityKey: null,
        country: null,
        latitude: null,
        longitude: null,
        placePrecision: 'city' as const,
      };
    const placePrecision = communityId ? ('exact' as const) : ('city' as const);
    // При точности `city` координаты огрубляются до сетки уже на записи —
    // и в скалярных колонках (карта, радиус), и в JSON `location`, чтобы
    // точное место человека нигде не сохранялось.
    const { lat, lon } = coordsForPrecision(
      location.lat,
      location.lon,
      placePrecision,
    );
    return {
      location: { ...location, lat, lon } as unknown as Prisma.InputJsonValue,
      city: location.city.trim(),
      cityKey: normalizeCityKey(location.city),
      country: location.country?.trim() ?? null,
      latitude: lat,
      longitude: lon,
      placePrecision,
    };
  }

  /** Обложка — первая картинка по sortOrder, чтобы лента не тянула связь. */
  private async syncPrimaryImage(noticeId: string) {
    const images = await this.prisma.noticeImage.findMany({
      where: { noticeId },
      orderBy: { sortOrder: 'asc' },
    });
    await this.prisma.notice.update({
      where: { id: noticeId },
      data: { primaryImageUrl: images[0]?.url ?? null },
    });
    return images;
  }

  /**
   * Счётчик рубрики пересчитывается запросом, а не инкрементом: публикация,
   * скрытие, протухание и удаление меняют его в разные стороны, и рассинхрон
   * инкрементов видно в навигации сразу.
   */
  private async recountRubric(rubricId: string) {
    await recountRubric(this.prisma, rubricId);
  }
}

function trimOrNull(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
