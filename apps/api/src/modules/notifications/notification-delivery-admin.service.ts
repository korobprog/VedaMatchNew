import { Injectable } from '@nestjs/common';
import type {
  NotificationDeliveryHealthResponse,
  NotificationDeliveryUserDto,
  NotificationUnreachableUserDto,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { deliveryHealthSelect } from './notifications.service';
import {
  buildDeliveryPoints,
  compareDeliveryUsers,
  DELIVERY_ROWS_CAP,
} from './delivery-report';

/** Сколько людей показываем в каждом списке: раздел — для разбора жалобы. */
const PEOPLE_LIMIT = 50;

/** За какой срок считаем «уведомления шли, а доставлять было некуда». */
const DEFAULT_WINDOW_DAYS = 14;
const MAX_WINDOW_DAYS = 90;

/**
 * Раздел «Доставка» админки уведомлений (VED-314).
 *
 * Отвечает на два вопроса, ради которых раньше приходилось лезть по ssh в
 * базу прода: «есть ли у этого человека живые точки доставки и когда каждая
 * последний раз принимала пуш» и «кому уведомления шли, а доставлять было
 * некуда».
 *
 * Второй список — не перепись всех, у кого нет пушей: таких большинство, и
 * они ничего не ждут. В него попадает только тот, кому за отчётный срок
 * действительно приходили уведомления, — как участник из жалобы 21.09: девять
 * уведомлений за вечер, ноль точек доставки, и в логах одно «пропущено: нет
 * подписок», которое никто не читает.
 */
@Injectable()
export class NotificationDeliveryAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async health(
    windowDaysInput?: number,
  ): Promise<NotificationDeliveryHealthResponse> {
    const windowDays = normalizeWindowDays(windowDaysInput);
    const now = new Date();
    const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

    const [web, devices] = await Promise.all([
      this.prisma.pushSubscription.findMany({
        take: DELIVERY_ROWS_CAP,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          userId: true,
          userAgent: true,
          lastFailureAt: true,
          ...deliveryHealthSelect,
        },
      }),
      this.prisma.notificationDevice.findMany({
        take: DELIVERY_ROWS_CAP,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          userId: true,
          provider: true,
          platform: true,
          appVariant: true,
          lastFailureAt: true,
          ...deliveryHealthSelect,
        },
      }),
    ]);

    const digest = buildDeliveryPoints({ web, devices }, now);
    const [people, unreachable] = await Promise.all([
      this.people(digest.byUser),
      this.unreachable(digest.reachableUserIds, digest.deadOnlyUserIds, since),
    ]);

    return {
      windowDays,
      summary: {
        ...digest.summary,
        usersReachable: digest.reachableUserIds.size,
        usersUnreachable: unreachable.total,
      },
      people,
      unreachable: unreachable.rows,
    };
  }

  /** Люди с точками доставки, худшие сверху. Имя мирское: это админка. */
  private async people(
    byUser: Map<
      string,
      NotificationDeliveryHealthResponse['people'][number]['points']
    >,
  ): Promise<NotificationDeliveryUserDto[]> {
    const ordered = [...byUser.entries()]
      .map(([userId, points]) => ({ userId, points }))
      .sort(compareDeliveryUsers)
      .slice(0, PEOPLE_LIMIT);
    const users = await this.prisma.user.findMany({
      where: { id: { in: ordered.map((row) => row.userId) } },
      select: { id: true, name: true, email: true },
    });
    const byId = new Map(users.map((user) => [user.id, user]));
    return ordered.map((row) => ({
      userId: row.userId,
      // Удалённый в тот же миг аккаунт — не повод ронять страницу.
      name: byId.get(row.userId)?.name ?? '—',
      email: byId.get(row.userId)?.email ?? '',
      points: row.points,
    }));
  }

  /**
   * Кому уведомления шли, а доставлять было некуда. Считаем по колокольчику:
   * каждая его запись — уведомление, которое человек увидел бы пушем, будь
   * куда доставлять. Помеченные мёртвыми точки за доставку не считаются.
   */
  private async unreachable(
    reachableUserIds: Set<string>,
    deadOnlyUserIds: Set<string>,
    since: Date,
  ): Promise<{ total: number; rows: NotificationUnreachableUserDto[] }> {
    const groups = await this.prisma.notificationItem.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _max: { createdAt: true },
    });
    const candidates = groups
      .filter((group) => !reachableUserIds.has(group.userId))
      .sort((a, b) => b._count._all - a._count._all);
    const top = candidates.slice(0, PEOPLE_LIMIT);
    const [users, preferences] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: top.map((row) => row.userId) } },
        select: { id: true, name: true, email: true },
      }),
      this.prisma.notificationPreference.findMany({
        where: { userId: { in: top.map((row) => row.userId) } },
        select: { userId: true, enabled: true },
      }),
    ]);
    const byId = new Map(users.map((user) => [user.id, user]));
    const enabledById = new Map(
      preferences.map((row) => [row.userId, row.enabled]),
    );
    return {
      total: candidates.length,
      rows: top.map((row) => ({
        userId: row.userId,
        name: byId.get(row.userId)?.name ?? '—',
        email: byId.get(row.userId)?.email ?? '',
        missed: row._count._all,
        lastNotificationAt: (row._max.createdAt ?? since).toISOString(),
        // Нет строки настроек — включено всё, как и в getPreferences().
        notificationsEnabled: enabledById.get(row.userId) ?? true,
        hasDeadPoints: deadOnlyUserIds.has(row.userId),
      })),
    };
  }
}

/** Срок из запроса: мусор и выход за границы — молча к разумному значению. */
export function normalizeWindowDays(input?: number): number {
  if (!input || !Number.isFinite(input)) return DEFAULT_WINDOW_DAYS;
  return Math.min(Math.max(Math.trunc(input), 1), MAX_WINDOW_DAYS);
}
