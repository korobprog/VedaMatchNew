import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import { UNION_ADMIN_HIDE_REASON_MIN_LENGTH } from '@vedamatch/shared';
import type {
  AdminAuditEvent,
  ProfileLocation,
  UnionAdminHideProfileRequest,
  UnionAdminProfileDto,
  UnionAdminProfileListItem,
  UnionAdminProfileListResponse,
  UnionAdminProfileQuery,
  UnionAdminStats,
  UnionIntentionDto,
  UnionPrivacySettings,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Модерация анкет знакомств. Отдельный сервис, а не метод в UnionProfileService:
 * тот отдаёт анкету человеку и применяет к ней настройки приватности, а здесь
 * нужна анкета как она есть — иначе жалобу не разобрать.
 */
@Injectable()
export class UnionAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async listProfiles(
    query: UnionAdminProfileQuery,
  ): Promise<UnionAdminProfileListResponse> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(query.pageSize) || DEFAULT_PAGE_SIZE),
    );
    const where = buildProfileWhere(query);
    if (query.reportedOnly) {
      // Фильтр по жалобам нельзя применять к уже выбранной странице: тогда
      // «всего» считалось бы по одному, а показывалось другое. Открытых жалоб
      // мало, поэтому список их адресатов дешевле собрать заранее.
      const reported = await this.prisma.userReport.groupBy({
        by: ['targetId'],
        where: { status: 'open' },
      });
      where.userId = { in: reported.map((row) => row.targetId) };
    }

    const [rows, total] = await Promise.all([
      this.prisma.unionProfile.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: profileListSelect,
      }),
      this.prisma.unionProfile.count({ where }),
    ]);

    return {
      items: await this.withCounters(rows),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async profile(userId: string): Promise<UnionAdminProfileDto> {
    const row = await this.prisma.unionProfile.findUnique({
      where: { userId },
      select: profileDetailSelect,
    });
    if (!row) throw new NotFoundException('Анкета не найдена');

    const [base] = await this.withCounters([row]);
    const [swipesMade, likesReceived, requestsSent, requestsReceived, matches] =
      await Promise.all([
        this.prisma.unionSwipe.count({
          where: { fromUserId: userId, undoneAt: null },
        }),
        this.prisma.unionSwipe.count({
          where: { toUserId: userId, decision: { in: ['like', 'superlike'] } },
        }),
        this.prisma.unionConnectionRequest.count({
          where: { fromUserId: userId },
        }),
        this.prisma.unionConnectionRequest.count({
          where: { toUserId: userId },
        }),
        this.prisma.unionConnectionRequest.count({
          where: {
            status: 'accepted',
            OR: [{ fromUserId: userId }, { toUserId: userId }],
          },
        }),
      ]);

    return {
      ...base,
      about: row.user.about,
      status: row.status,
      format: row.format,
      languages: row.user.languages,
      skills: row.skills,
      interests: row.interests,
      values: row.values,
      familyStatus: row.familyStatus,
      privacy: (row.privacy ?? null) as UnionPrivacySettings | null,
      requestsFromVerifiedOnly: row.requestsFromVerifiedOnly,
      contactMode: row.contactMode,
      createdAt: row.createdAt.toISOString(),
      intentions: row.intentions.map((intention): UnionIntentionDto => ({
        type: intention.type,
        weight: intention.weight,
      })),
      activity: {
        swipesMade,
        likesReceived,
        requestsSent,
        requestsReceived,
        matches,
      },
    };
  }

  /**
   * Снять анкету с выдачи, не трогая аккаунт. Промежуточный рычаг между
   * «ничего» и блокировкой: человек продолжает пользоваться порталом, но в
   * рекомендациях знакомств не показывается.
   */
  async hideProfile(
    adminId: string,
    userId: string,
    body: UnionAdminHideProfileRequest,
  ): Promise<UnionAdminProfileDto> {
    const reason = body?.reason?.trim() ?? '';
    if (reason.length < UNION_ADMIN_HIDE_REASON_MIN_LENGTH) {
      throw new BadRequestException(
        `Укажите причину минимум ${UNION_ADMIN_HIDE_REASON_MIN_LENGTH} символов`,
      );
    }
    await this.setActive(userId, false);
    this.audit(adminId, 'union.profile-hidden', userId, { reason });
    return this.profile(userId);
  }

  async restoreProfile(
    adminId: string,
    userId: string,
  ): Promise<UnionAdminProfileDto> {
    await this.setActive(userId, true);
    this.audit(adminId, 'union.profile-restored', userId);
    return this.profile(userId);
  }

  /**
   * Переписка пары по жалобе. Единственный способ для администрации увидеть
   * чужой чат — и только по существующей жалобе: без неё повода нет. Сам
   * просмотр пишется в журнал действий, потому что это чтение личного.
   */
  async stats(now: Date = new Date()): Promise<UnionAdminStats> {
    const since = new Date(now.getTime() - WEEK_MS);
    const [
      total,
      active,
      swipes,
      likes,
      requests,
      matchesTotal,
      matchesPending,
      boostsActive,
    ] = await Promise.all([
      this.prisma.unionProfile.count(),
      this.prisma.unionProfile.count({ where: { isActive: true } }),
      this.prisma.unionSwipe.count({ where: { createdAt: { gte: since } } }),
      this.prisma.unionSwipe.count({
        where: {
          createdAt: { gte: since },
          decision: { in: ['like', 'superlike'] },
        },
      }),
      this.prisma.unionConnectionRequest.count({
        where: { createdAt: { gte: since } },
      }),
      this.prisma.unionConnectionRequest.count({
        where: { status: 'accepted' },
      }),
      this.prisma.unionConnectionRequest.count({
        where: { status: 'pending' },
      }),
      this.prisma.unionBoost.count({ where: { expiresAt: { gt: now } } }),
    ]);

    return {
      profiles: { total, active, hidden: total - active },
      week: { swipes, likes, requests },
      matches: { total: matchesTotal, pending: matchesPending },
      boostsActive,
    };
  }

  private async setActive(userId: string, isActive: boolean): Promise<void> {
    const updated = await this.prisma.unionProfile.updateMany({
      where: { userId },
      data: { isActive },
    });
    if (updated.count === 0) throw new NotFoundException('Анкета не найдена');
  }

  /**
   * Счётчики, которых нет в самой анкете: фото и открытые жалобы. Одним
   * запросом на страницу, а не по строке — иначе на списке из ста анкет
   * получается двести походов в базу.
   */
  private async withCounters(
    rows: ProfileListRow[],
  ): Promise<UnionAdminProfileListItem[]> {
    if (rows.length === 0) return [];
    const userIds = rows.map((row) => row.userId);
    const [photos, reports] = await Promise.all([
      this.prisma.userPhoto.groupBy({
        by: ['userId'],
        where: { userId: { in: userIds } },
        _count: { _all: true },
      }),
      this.prisma.userReport.groupBy({
        by: ['targetId'],
        where: { targetId: { in: userIds }, status: 'open' },
        _count: { _all: true },
      }),
    ]);
    const photosByUser = new Map(
      photos.map((row) => [row.userId, row._count._all]),
    );
    const reportsByUser = new Map(
      reports.map((row) => [row.targetId, row._count._all]),
    );

    return rows.map((row) => ({
      userId: row.userId,
      name: row.user.name,
      email: row.user.email,
      spiritualStage: row.user.spiritualStage,
      city: (row.user.homeLocation as ProfileLocation | null)?.city ?? null,
      isActive: row.isActive,
      accountBlocked: row.user.accountStatus !== 'active',
      openReports: reportsByUser.get(row.userId) ?? 0,
      photosCount: photosByUser.get(row.userId) ?? 0,
      lastSeenAt: row.user.lastSeenAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  private audit(
    actorId: string,
    action: AdminAuditEvent['action'],
    userId: string,
    details?: AdminAuditEvent['details'],
  ): void {
    const event: AdminAuditEvent = {
      actorId,
      action,
      targetType: 'user',
      targetId: userId,
      details,
    };
    this.events.emit('admin.action', event);
  }
}

const profileListSelect = {
  userId: true,
  isActive: true,
  updatedAt: true,
  user: {
    select: {
      name: true,
      spiritualName: true,
      email: true,
      spiritualStage: true,
      accountStatus: true,
      homeLocation: true,
      lastSeenAt: true,
      // Рассказ и языки живут в портальном профиле — см. контракт.
      about: true,
      languages: true,
    },
  },
} satisfies Prisma.UnionProfileSelect;

type ProfileListRow = Prisma.UnionProfileGetPayload<{
  select: typeof profileListSelect;
}>;

/** Карточка анкеты. Вынесено в константу с `satisfies`, а не собрано прямо
 *  в вызове: при спреде внутри `select` литерал расширяется, и Prisma перестаёт
 *  выводить тип строки. */
const profileDetailSelect = {
  ...profileListSelect,
  status: true,
  format: true,
  skills: true,
  interests: true,
  values: true,
  familyStatus: true,
  privacy: true,
  requestsFromVerifiedOnly: true,
  contactMode: true,
  createdAt: true,
  intentions: { select: { type: true, weight: true } },
} satisfies Prisma.UnionProfileSelect;

/**
 * Фильтры списка анкет. Отдельной функцией — её и стоит тестировать: поиск
 * идёт по мирскому имени и почте, но подпись человека в сервисе может быть
 * духовной, поэтому в запрос попадают оба имени.
 */
export function buildProfileWhere(
  query: UnionAdminProfileQuery,
): Prisma.UnionProfileWhereInput {
  const where: Prisma.UnionProfileWhereInput = {};

  if (query.visibility === 'active') where.isActive = true;
  if (query.visibility === 'hidden') where.isActive = false;

  const q = query.q?.trim();
  if (q) {
    where.user = {
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { spiritualName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ],
    };
  }
  return where;
}
