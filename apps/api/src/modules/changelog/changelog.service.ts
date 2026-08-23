import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AdminAnnouncementDto,
  AnnouncementAudienceStage,
  BroadcastAnnouncementRequest,
  BroadcastAnnouncementResult,
  AdminReleaseDto,
  AdminRoadmapItemDto,
  AnnouncementStatus,
  CreateAnnouncementRequest,
  CreateReleaseRequest,
  CreateRoadmapItemRequest,
  PublicAnnouncementDto,
  PublicReleaseDto,
  PublicRoadmapItemDto,
  Role,
  RoadmapStatus,
  UpdateAnnouncementRequest,
  UpdateReleaseRequest,
  UpdateRoadmapItemRequest,
} from '@vedamatch/shared';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import {
  announcementSortDate,
  isAnnouncementVisible,
  visibleAnnouncementWhere,
} from './announcement-visibility';

export type Lang = 'ru' | 'en';

const ANNOUNCEMENT_STATUSES: AnnouncementStatus[] = ['draft', 'published'];
const ROADMAP_STATUSES: RoadmapStatus[] = ['planned', 'in_progress', 'done'];

@Injectable()
export class ChangelogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  // ===== Публичное чтение =====

  async listReleases(lang: Lang): Promise<PublicReleaseDto[]> {
    const releases = await this.prisma.release.findMany({
      include: { changes: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { releasedAt: 'desc' },
    });
    return releases.map((release) => this.toPublicRelease(release, lang));
  }

  async getCurrentRelease(lang: Lang): Promise<PublicReleaseDto | null> {
    const release = await this.prisma.release.findFirst({
      where: { isCurrent: true },
      include: { changes: { orderBy: { sortOrder: 'asc' } } },
    });
    return release ? this.toPublicRelease(release, lang) : null;
  }

  /**
   * Видимые новости. `userId` заполняет отметку «ознакомлен»: без него —
   * публичный список, где отмечать нечего и некому.
   */
  async listAnnouncements(
    lang: Lang,
    userId?: string,
  ): Promise<PublicAnnouncementDto[]> {
    const announcements = await this.prisma.announcement.findMany({
      where: visibleAnnouncementWhere(new Date()),
    });
    const acknowledged = userId
      ? new Set(
          (
            await this.prisma.announcementAck.findMany({
              where: {
                userId,
                announcementId: { in: announcements.map((item) => item.id) },
              },
              select: { announcementId: true },
            })
          ).map((ack) => ack.announcementId),
        )
      : new Set<string>();
    // Порядок наводим здесь: у отложенной новости «когда вышла» — назначенное
    // время, а не отметка публикации, и одним `orderBy` эти два поля не свести.
    return announcements
      .sort(
        (left, right) =>
          announcementSortDate(right).getTime() -
          announcementSortDate(left).getTime(),
      )
      .sort((left, right) => Number(right.pinned) - Number(left.pinned))
      .map((item) => ({
        id: item.id,
        title: lang === 'en' ? item.titleEn : item.titleRu,
        body: lang === 'en' ? item.bodyEn : item.bodyRu,
        publishedAt: announcementSortDate(item).toISOString(),
        pinned: item.pinned,
        acknowledged: acknowledged.has(item.id),
      }));
  }

  /**
   * Отметка «ознакомлен».
   *
   * Идемпотентна: повторное нажатие с другой вкладки не должно ни падать, ни
   * задваивать статистику — поэтому `upsert` по паре, а не `create`.
   * Отмечать разрешаем только видимую новость: снятую с главной человек не
   * видел, и её отметка исказила бы счётчик.
   */
  async acknowledgeAnnouncement(
    userId: string,
    id: string,
  ): Promise<{ ok: true }> {
    const announcement = await this.prisma.announcement.findUnique({
      where: { id },
    });
    if (!announcement || !isAnnouncementVisible(announcement, new Date()))
      throw new NotFoundException('Новость не найдена');
    await this.prisma.announcementAck.upsert({
      where: { announcementId_userId: { announcementId: id, userId } },
      create: { announcementId: id, userId },
      update: {},
    });
    return { ok: true };
  }

  async listRoadmap(lang: Lang): Promise<PublicRoadmapItemDto[]> {
    const items = await this.prisma.roadmapItem.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    return items.map((item) => ({
      id: item.id,
      title: lang === 'en' ? item.titleEn : item.titleRu,
      description:
        (lang === 'en' ? item.descriptionEn : item.descriptionRu) ?? null,
      status: item.status,
      sortOrder: item.sortOrder,
    }));
  }

  // ===== Admin: релизы =====

  async adminListReleases(role: Role): Promise<AdminReleaseDto[]> {
    this.ensureAdmin(role);
    const releases = await this.prisma.release.findMany({
      include: { changes: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { releasedAt: 'desc' },
    });
    return releases.map((release) => this.toAdminRelease(release));
  }

  async adminCreateRelease(
    role: Role,
    body: CreateReleaseRequest,
  ): Promise<AdminReleaseDto> {
    this.ensureAdmin(role);
    const release = await this.prisma.release.create({
      data: {
        version: body.version,
        releasedAt: new Date(body.releasedAt),
        changes: {
          create: (body.changes ?? []).map((change, index) => ({
            type: change.type,
            titleRu: change.titleRu,
            titleEn: change.titleEn,
            sortOrder: change.sortOrder ?? index,
          })),
        },
      },
      include: { changes: { orderBy: { sortOrder: 'asc' } } },
    });
    return this.toAdminRelease(release);
  }

  async adminUpdateRelease(
    role: Role,
    id: string,
    body: UpdateReleaseRequest,
  ): Promise<AdminReleaseDto> {
    this.ensureAdmin(role);
    await this.requireRelease(id);

    const release = await this.prisma.$transaction(async (tx) => {
      if (body.changes) {
        await tx.releaseChange.deleteMany({ where: { releaseId: id } });
      }
      return tx.release.update({
        where: { id },
        data: {
          version: body.version,
          releasedAt: body.releasedAt ? new Date(body.releasedAt) : undefined,
          changes: body.changes
            ? {
                create: body.changes.map((change, index) => ({
                  type: change.type,
                  titleRu: change.titleRu,
                  titleEn: change.titleEn,
                  sortOrder: change.sortOrder ?? index,
                })),
              }
            : undefined,
        },
        include: { changes: { orderBy: { sortOrder: 'asc' } } },
      });
    });
    return this.toAdminRelease(release);
  }

  /** Снимает `isCurrent` с прежней записи и ставит на новую в одной транзакции. */
  async adminSetCurrentRelease(role: Role, id: string): Promise<{ ok: true }> {
    this.ensureAdmin(role);
    await this.requireRelease(id);
    await this.prisma.$transaction([
      this.prisma.release.updateMany({
        where: { isCurrent: true },
        data: { isCurrent: false },
      }),
      this.prisma.release.update({
        where: { id },
        data: { isCurrent: true },
      }),
    ]);
    return { ok: true };
  }

  async adminDeleteRelease(role: Role, id: string): Promise<{ ok: true }> {
    this.ensureAdmin(role);
    await this.requireRelease(id);
    await this.prisma.release.delete({ where: { id } });
    return { ok: true };
  }

  // ===== Admin: новости =====

  async adminListAnnouncements(role: Role): Promise<AdminAnnouncementDto[]> {
    this.ensureAdmin(role);
    const items = await this.prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { acks: true } } },
    });
    return items.map((item) => this.toAdminAnnouncement(item));
  }

  async adminCreateAnnouncement(
    role: Role,
    body: CreateAnnouncementRequest,
  ): Promise<AdminAnnouncementDto> {
    this.ensureAdmin(role);
    const status = this.normalizeAnnouncementStatus(body.status);
    const schedule = this.announcementSchedule(body);
    // Закреплённая всегда одна: снимаем прежнюю в той же транзакции, иначе
    // частичный уникальный индекс отвергнет вставку.
    const item = await this.prisma.$transaction(async (tx) => {
      if (body.pinned) await tx.announcement.updateMany({ where: { pinned: true }, data: { pinned: false } });
      return tx.announcement.create({
        data: {
          titleRu: body.titleRu,
          titleEn: body.titleEn,
          bodyRu: body.bodyRu,
          bodyEn: body.bodyEn,
          status,
          pinned: Boolean(body.pinned),
          ...schedule,
          publishedAt: status === 'published' ? new Date() : null,
        },
      });
    });
    return this.toAdminAnnouncement(item);
  }

  async adminUpdateAnnouncement(
    role: Role,
    id: string,
    body: UpdateAnnouncementRequest,
  ): Promise<AdminAnnouncementDto> {
    this.ensureAdmin(role);
    const existing = await this.prisma.announcement.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Новость не найдена');

    const status = body.status
      ? this.normalizeAnnouncementStatus(body.status)
      : undefined;
    const becamePublished =
      status === 'published' && existing.status !== 'published';

    const schedule = this.announcementSchedule(body);
    const item = await this.prisma.$transaction(async (tx) => {
      if (body.pinned)
        await tx.announcement.updateMany({
          where: { pinned: true, NOT: { id } },
          data: { pinned: false },
        });
      return tx.announcement.update({
        where: { id },
        include: { _count: { select: { acks: true } } },
        data: {
          titleRu: body.titleRu,
          titleEn: body.titleEn,
          bodyRu: body.bodyRu,
          bodyEn: body.bodyEn,
          status,
          ...(body.pinned === undefined ? {} : { pinned: body.pinned }),
          ...schedule,
          publishedAt: becamePublished ? new Date() : undefined,
        },
      });
    });
    return this.toAdminAnnouncement(item);
  }

  /**
   * Разослать новость участникам.
   *
   * Отдельным действием, а не частью публикации: новость на главной никого не
   * беспокоит, а рассылка приходит в колокольчик и на телефон — решать, стоит
   * ли она того, должен человек, а не код.
   *
   * Уведомления уходят событиями на шину: сервисный модуль не вправе дёргать
   * чужой напрямую, а подписчик сам сверится с настройками получателя и
   * отправит push тем, у кого есть подписка.
   */
  async adminBroadcastAnnouncement(
    role: Role,
    id: string,
    body: BroadcastAnnouncementRequest = {},
  ): Promise<BroadcastAnnouncementResult> {
    this.ensureAdmin(role);
    const announcement = await this.prisma.announcement.findUnique({
      where: { id },
    });
    if (!announcement) throw new NotFoundException('Новость не найдена');
    // Не только статус: отложенной новости на портале ещё нет, и человек,
    // пришедший по уведомлению, не нашёл бы её. Просроченной — тем более.
    if (!isAnnouncementVisible(announcement, new Date()))
      throw new BadRequestException(
        announcement.status === 'published'
          ? 'Новость сейчас не показывается на портале: проверьте даты показа'
          : 'Сначала опубликуйте новость: рассылать черновик некуда',
      );

    const stages = this.audienceStages(body.stages);
    const recipients = await this.prisma.user.findMany({
      where: {
        // Удалённые и анонимизированные аккаунты в рассылку не идут.
        deletedAt: null,
        ...(stages.length > 0 ? { spiritualStage: { in: stages } } : {}),
      },
      select: { id: true },
    });

    for (const recipient of recipients)
      this.events.emit('portal.announcement.published', {
        name: 'portal.announcement.published',
        recipientId: recipient.id,
        announcementId: announcement.id,
        title: announcement.titleRu,
        excerpt: announcement.bodyRu,
      });

    await this.prisma.announcement.update({
      where: { id },
      data: {
        broadcastAt: new Date(),
        broadcastCount: { increment: recipients.length },
      },
    });
    // Сколько дойдёт до телефонов, знает только подписчик: у части людей нет
    // подписки, у части выключена категория. Честно отдаём число адресатов.
    return { recipients: recipients.length, pushed: recipients.length };
  }

  private audienceStages(
    stages: AnnouncementAudienceStage[] | undefined,
  ): AnnouncementAudienceStage[] {
    if (!stages || stages.length === 0) return [];
    const known = new Set<string>(['seeker', 'practitioner', 'yogi', 'devotee']);
    const picked = stages.filter((stage) => known.has(stage));
    if (picked.length === 0)
      throw new BadRequestException('Неизвестная ступень в списке аудитории');
    return picked;
  }

  async adminDeleteAnnouncement(role: Role, id: string): Promise<{ ok: true }> {
    this.ensureAdmin(role);
    const existing = await this.prisma.announcement.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Новость не найдена');
    await this.prisma.announcement.delete({ where: { id } });
    return { ok: true };
  }

  // ===== Admin: roadmap =====

  async adminListRoadmap(role: Role): Promise<AdminRoadmapItemDto[]> {
    this.ensureAdmin(role);
    const items = await this.prisma.roadmapItem.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    return items.map((item) => this.toAdminRoadmapItem(item));
  }

  async adminCreateRoadmapItem(
    role: Role,
    body: CreateRoadmapItemRequest,
  ): Promise<AdminRoadmapItemDto> {
    this.ensureAdmin(role);
    const item = await this.prisma.roadmapItem.create({
      data: {
        titleRu: body.titleRu,
        titleEn: body.titleEn,
        descriptionRu: body.descriptionRu ?? null,
        descriptionEn: body.descriptionEn ?? null,
        status: this.normalizeRoadmapStatus(body.status),
        sortOrder: body.sortOrder ?? 0,
      },
    });
    return this.toAdminRoadmapItem(item);
  }

  async adminUpdateRoadmapItem(
    role: Role,
    id: string,
    body: UpdateRoadmapItemRequest,
  ): Promise<AdminRoadmapItemDto> {
    this.ensureAdmin(role);
    const existing = await this.prisma.roadmapItem.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Пункт roadmap не найден');

    const item = await this.prisma.roadmapItem.update({
      where: { id },
      data: {
        titleRu: body.titleRu,
        titleEn: body.titleEn,
        descriptionRu: body.descriptionRu,
        descriptionEn: body.descriptionEn,
        status: body.status
          ? this.normalizeRoadmapStatus(body.status)
          : undefined,
        sortOrder: body.sortOrder,
      },
    });
    return this.toAdminRoadmapItem(item);
  }

  async adminDeleteRoadmapItem(role: Role, id: string): Promise<{ ok: true }> {
    this.ensureAdmin(role);
    const existing = await this.prisma.roadmapItem.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Пункт roadmap не найден');
    await this.prisma.roadmapItem.delete({ where: { id } });
    return { ok: true };
  }

  // ===== Приватные помощники =====

  private toPublicRelease(
    release: {
      id: string;
      version: string;
      isCurrent: boolean;
      releasedAt: Date;
      changes: Array<{
        id: string;
        type: 'feature' | 'fix' | 'improvement';
        titleRu: string;
        titleEn: string;
        sortOrder: number;
      }>;
    },
    lang: Lang,
  ): PublicReleaseDto {
    return {
      id: release.id,
      version: release.version,
      isCurrent: release.isCurrent,
      releasedAt: release.releasedAt.toISOString(),
      changes: release.changes.map((change) => ({
        id: change.id,
        type: change.type,
        title: lang === 'en' ? change.titleEn : change.titleRu,
        sortOrder: change.sortOrder,
      })),
    };
  }

  private toAdminRelease(release: {
    id: string;
    version: string;
    isCurrent: boolean;
    releasedAt: Date;
    changes: Array<{
      id: string;
      type: 'feature' | 'fix' | 'improvement';
      titleRu: string;
      titleEn: string;
      sortOrder: number;
    }>;
  }): AdminReleaseDto {
    return {
      id: release.id,
      version: release.version,
      isCurrent: release.isCurrent,
      releasedAt: release.releasedAt.toISOString(),
      changes: release.changes,
    };
  }

  /**
   * Разбор дат расписания. Пустая строка и null означают «снять», отсутствие
   * поля — «не трогать»: админка шлёт частичное обновление, и молча обнулять
   * то, чего в запросе не было, нельзя.
   */
  private announcementSchedule(body: {
    publishAt?: string | null;
    expiresAt?: string | null;
  }): { publishAt?: Date | null; expiresAt?: Date | null } {
    const parse = (value: string | null | undefined) => {
      if (value === undefined) return undefined;
      if (!value) return null;
      const date = new Date(value);
      if (Number.isNaN(date.getTime()))
        throw new BadRequestException('Некорректная дата расписания');
      return date;
    };
    const publishAt = parse(body.publishAt);
    const expiresAt = parse(body.expiresAt);
    if (publishAt && expiresAt && expiresAt.getTime() <= publishAt.getTime())
      throw new BadRequestException('Срок показа кончается раньше, чем начинается');
    return {
      ...(publishAt === undefined ? {} : { publishAt }),
      ...(expiresAt === undefined ? {} : { expiresAt }),
    };
  }

  private toAdminAnnouncement(item: {
    id: string;
    titleRu: string;
    titleEn: string;
    bodyRu: string;
    bodyEn: string;
    status: AnnouncementStatus;
    publishedAt: Date | null;
    pinned: boolean;
    publishAt: Date | null;
    expiresAt: Date | null;
    broadcastAt: Date | null;
    broadcastCount: number;
    /** Приходит из `_count`; у только что созданной новости его ещё нет. */
    _count?: { acks: number };
  }): AdminAnnouncementDto {
    return {
      id: item.id,
      titleRu: item.titleRu,
      titleEn: item.titleEn,
      bodyRu: item.bodyRu,
      bodyEn: item.bodyEn,
      status: item.status,
      publishedAt: item.publishedAt?.toISOString() ?? null,
      pinned: item.pinned,
      publishAt: item.publishAt?.toISOString() ?? null,
      expiresAt: item.expiresAt?.toISOString() ?? null,
      broadcastAt: item.broadcastAt?.toISOString() ?? null,
      broadcastCount: item.broadcastCount,
      acknowledgedCount: item._count?.acks ?? 0,
    };
  }

  private toAdminRoadmapItem(item: {
    id: string;
    titleRu: string;
    titleEn: string;
    descriptionRu: string | null;
    descriptionEn: string | null;
    status: RoadmapStatus;
    sortOrder: number;
  }): AdminRoadmapItemDto {
    return item;
  }

  private normalizeAnnouncementStatus(
    status: AnnouncementStatus | undefined,
  ): AnnouncementStatus {
    return status && ANNOUNCEMENT_STATUSES.includes(status) ? status : 'draft';
  }

  private normalizeRoadmapStatus(
    status: RoadmapStatus | undefined,
  ): RoadmapStatus {
    return status && ROADMAP_STATUSES.includes(status) ? status : 'planned';
  }

  private async requireRelease(id: string): Promise<void> {
    const release = await this.prisma.release.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!release) throw new NotFoundException('Релиз не найден');
  }

  private ensureAdmin(role: Role): void {
    if (role !== 'admin') {
      throw new ForbiddenException('Доступ только для администратора');
    }
  }
}

/**
 * Срок показа баннера из тела запроса. Пустая строка и null одинаково значат
 * «без срока»: иначе очищенное поле формы превращалось бы в Invalid Date.
 */
function parseHomeUntil(value: string | null | undefined): Date | null {
  const text = value?.trim();
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException('Некорректная дата показа на главной');
  }
  return parsed;
}
