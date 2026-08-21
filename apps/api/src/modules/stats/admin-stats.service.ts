import { Injectable } from '@nestjs/common';
import type { AdminPortalStats } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Статусы обращения, по которым тикет ещё ждёт ответа администрации. */
const OPEN_TICKET_STATUSES = ['open', 'in_progress', 'waiting_user'] as const;

/**
 * Сводка для главной админки. Считает только портальные сущности — люди,
 * жалобы на людей, обращения, сообщества. Очереди сервисов сюда не тянутся:
 * их отдают сами сервисы своими админскими маршрутами, иначе портал начал бы
 * читать чужие таблицы в обход контракта сервисного модуля.
 */
@Injectable()
export class AdminStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async portalStats(): Promise<AdminPortalStats> {
    const now = Date.now();
    const since = (days: number) => new Date(now - days * DAY_MS);

    const [
      total,
      active,
      blocked,
      newLast7Days,
      newLast30Days,
      seenLast24Hours,
      paidSubscriptions,
      userReports,
      supportTickets,
      verificationRequests,
      communities,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { accountStatus: 'active' } }),
      this.prisma.user.count({ where: { accountStatus: 'blocked' } }),
      this.prisma.user.count({ where: { createdAt: { gte: since(7) } } }),
      this.prisma.user.count({ where: { createdAt: { gte: since(30) } } }),
      this.prisma.user.count({ where: { lastSeenAt: { gte: since(1) } } }),
      this.prisma.user.count({
        where: { subscriptionPaidUntil: { gt: new Date(now) } },
      }),
      this.prisma.userReport.count({ where: { status: 'open' } }),
      this.prisma.supportTicket.count({
        where: { status: { in: [...OPEN_TICKET_STATUSES] } },
      }),
      this.prisma.mentorVerificationRequest.count({
        where: { status: { in: ['mentor_submitted', 'awaiting_admin'] } },
      }),
      this.prisma.community.count({ where: { status: 'pending' } }),
    ]);

    return {
      users: {
        total,
        active,
        blocked,
        newLast7Days,
        newLast30Days,
        seenLast24Hours,
        paidSubscriptions,
      },
      queues: [
        { key: 'userReports', count: userReports },
        { key: 'supportTickets', count: supportTickets },
        { key: 'verificationRequests', count: verificationRequests },
        { key: 'communities', count: communities },
      ],
    };
  }
}
