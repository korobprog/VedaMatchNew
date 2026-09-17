import { Injectable } from '@nestjs/common';
import type { AdminLoginStats, AdminPortalStats } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildAdminLoginStats,
  type LoginCounterRow,
  type LoginReturnRow,
} from './login-funnel-shape';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Статусы обращения, по которым тикет ещё ждёт ответа администрации. */
const OPEN_TICKET_STATUSES = ['open', 'in_progress', 'waiting_user'] as const;

/**
 * Сводка для главной админки. Считает только портальные сущности — люди,
 * жалобы на людей, обращения, сообщества. Очереди сервисов сюда не тянутся:
 * их отдают сами сервисы своими админскими маршрутами, иначе портал начал бы
 * читать чужие таблицы в обход контракта сервисного модуля.
 *
 * Раздел `logins` — исключение того же рода, что уже есть чуть ниже
 * (`userReport`, `supportTicket`, `mentorVerificationRequest` читаются
 * напрямую через глобальный `PrismaService`, а не через модули-владельцы):
 * `LoginAudit` не входит в список из четырёх портальных моделей контракта
 * (`User`, `UserBlock`, `Community`, `CommunityMember`), но воронка входа —
 * такая же сквозная админская сводка, как счётчики очередей выше, а не
 * бизнес-логика чужого сервиса. Издавать событие на каждый вход ради одной
 * админской таблицы избыточно; читаем таблицу `AuthModule` напрямую, следуя
 * уже принятому здесь прецеденту.
 */
@Injectable()
export class AdminStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async portalStats(now: Date = new Date()): Promise<AdminPortalStats> {
    const nowMs = now.getTime();
    const since = (days: number) => new Date(nowMs - days * DAY_MS);

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
      logins,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { accountStatus: 'active' } }),
      this.prisma.user.count({ where: { accountStatus: 'blocked' } }),
      this.prisma.user.count({ where: { createdAt: { gte: since(7) } } }),
      this.prisma.user.count({ where: { createdAt: { gte: since(30) } } }),
      this.prisma.user.count({ where: { lastSeenAt: { gte: since(1) } } }),
      this.prisma.user.count({
        where: { subscriptionPaidUntil: { gt: new Date(nowMs) } },
      }),
      this.prisma.userReport.count({ where: { status: 'open' } }),
      this.prisma.supportTicket.count({
        where: { status: { in: [...OPEN_TICKET_STATUSES] } },
      }),
      this.prisma.mentorVerificationRequest.count({
        where: { status: { in: ['mentor_submitted', 'awaiting_admin'] } },
      }),
      this.prisma.community.count({ where: { status: 'pending' } }),
      this.loginStats(now, since),
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
      logins,
    };
  }

  /**
   * Воронка входа по источнику: входы и уникальные люди за 7 и 30 дней плюс
   * доля вернувшихся через 7+ дней среди тех, чей первый вход через канал
   * (в окне последних 30 дней) случился минимум 7 дней назад. Три отдельных
   * запроса вместо `groupBy`: Prisma не считает `COUNT(DISTINCT userId)` и
   * не умеет оконную когорту «первый вход по ключу», а `$queryRaw` с
   * `(userId, createdAt)`/`(createdAt)` — тот же приём, что у
   * `StatsService.registrationsByDay`.
   */
  private async loginStats(
    now: Date,
    since: (days: number) => Date,
  ): Promise<AdminLoginStats> {
    const windowStart = since(30);
    const cohortCutoff = since(7);

    const [last7Days, last30Days, return7Day] = await Promise.all([
      this.prisma.$queryRaw<LoginCounterRow[]>`
        SELECT client, COUNT(*) AS logins, COUNT(DISTINCT "userId") AS users
        FROM "LoginAudit"
        WHERE "createdAt" >= ${since(7)} AND client IS NOT NULL
        GROUP BY client
      `,
      this.prisma.$queryRaw<LoginCounterRow[]>`
        SELECT client, COUNT(*) AS logins, COUNT(DISTINCT "userId") AS users
        FROM "LoginAudit"
        WHERE "createdAt" >= ${windowStart} AND client IS NOT NULL
        GROUP BY client
      `,
      this.prisma.$queryRaw<LoginReturnRow[]>`
        WITH first_logins AS (
          SELECT "userId", client, MIN("createdAt") AS "firstAt"
          FROM "LoginAudit"
          WHERE "createdAt" >= ${windowStart} AND client IS NOT NULL
          GROUP BY "userId", client
        ),
        cohort AS (
          SELECT * FROM first_logins WHERE "firstAt" <= ${cohortCutoff}
        )
        SELECT
          cohort.client AS client,
          COUNT(*) AS "cohortSize",
          COUNT(*) FILTER (
            WHERE EXISTS (
              SELECT 1 FROM "LoginAudit" la
              WHERE la."userId" = cohort."userId"
                AND la."createdAt" >= cohort."firstAt" + INTERVAL '7 days'
            )
          ) AS "returnedCount"
        FROM cohort
        GROUP BY cohort.client
      `,
    ]);

    return buildAdminLoginStats({ last7Days, last30Days, return7Day });
  }
}
