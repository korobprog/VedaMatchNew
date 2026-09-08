import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  VACANCY_MODERATOR_NOTE_MAX_LENGTH,
  type AdminVacancyOfferActionRequest,
  type AdminVacancyOfferDto,
  type AdminVacancyOffersFilters,
  type AdminVacancyOffersResponse,
  type AdminVacancyStatsDto,
  type VacancyKind,
  type VacancyStatus,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { VACANCY_KINDS } from './vacancy-validate';

const STATUSES: VacancyStatus[] = [
  'draft',
  'published',
  'hidden_by_author',
  'closed',
  'expired',
  'hidden_by_reports',
  'removed_by_admin',
];

const LIST_LIMIT = 100;

/**
 * Управление предложениями из /admin. Сервис не готов, пока им нельзя
 * управлять из админки — правило репозитория. Имена здесь мирские
 * намеренно: модератору нужно понимать, кто перед ним.
 */
@Injectable()
export class VacanciesAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    filters: AdminVacancyOffersFilters,
  ): Promise<AdminVacancyOffersResponse> {
    const where: Prisma.VacancyOfferWhereInput = {};
    if (filters.kind && VACANCY_KINDS.includes(filters.kind))
      where.kind = filters.kind;
    if (filters.status && STATUSES.includes(filters.status))
      where.status = filters.status;
    const q = filters.q?.trim();
    if (q)
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { author: { name: { contains: q, mode: 'insensitive' } } },
      ];

    const [rows, total] = await Promise.all([
      this.prisma.vacancyOffer.findMany({
        where,
        // Сначала то, на что жалуются: очередь модератора важнее хронологии.
        orderBy: [{ openReportsCount: 'desc' }, { publishedAt: 'desc' }],
        take: LIST_LIMIT,
        include: {
          author: { select: { name: true } },
          community: { select: { name: true } },
        },
      }),
      this.prisma.vacancyOffer.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        status: row.status,
        city: row.city,
        isRemote: row.isRemote,
        authorName: row.author.name,
        communityName: row.community?.name ?? null,
        publishedAt: row.publishedAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        responsesCount: row.responsesCount,
        openReportsCount: row.openReportsCount,
        moderatorNote: row.moderatorNote,
      })),
      total,
    };
  }

  /**
   * Скрыть, вернуть или снять предложение без жалобы. Возврат закрывает
   * открытые жалобы: модератор посмотрел и решил, что всё в порядке.
   */
  async act(
    adminId: string,
    id: string,
    body: AdminVacancyOfferActionRequest,
  ): Promise<AdminVacancyOfferDto> {
    const note = body.moderatorNote?.trim() || null;
    if (note && note.length > VACANCY_MODERATOR_NOTE_MAX_LENGTH)
      throw new BadRequestException('Комментарий слишком длинный');
    const offer = await this.prisma.vacancyOffer.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!offer) throw new NotFoundException('Предложение не найдено');

    const status: VacancyStatus =
      body.action === 'hide'
        ? 'hidden_by_reports'
        : body.action === 'remove'
          ? 'removed_by_admin'
          : 'published';
    if (
      body.action === 'restore' &&
      offer.status !== 'hidden_by_reports' &&
      offer.status !== 'removed_by_admin'
    )
      throw new BadRequestException('Вернуть можно только скрытое модератором');

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      if (body.action === 'restore')
        await tx.vacancyReport.updateMany({
          where: { offerId: id, status: 'open' },
          data: { status: 'reviewed', reviewedById: adminId, reviewedAt: now },
        });
      const openReportsCount = await tx.vacancyReport.count({
        where: { offerId: id, status: 'open' },
      });
      await tx.vacancyOffer.update({
        where: { id },
        data: {
          status,
          openReportsCount,
          moderatorNote: body.action === 'restore' ? null : note,
        },
      });
    });
    const { items } = await this.list({});
    const updated = items.find((item) => item.id === id);
    if (!updated) throw new NotFoundException('Предложение не найдено');
    return updated;
  }

  async stats(): Promise<AdminVacancyStatsDto> {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const [byKind, byStatus, responsesTotal, responsesLastWeek, openReports] =
      await Promise.all([
        this.prisma.vacancyOffer.groupBy({
          by: ['kind'],
          where: { status: 'published', expiresAt: { gt: now } },
          _count: { _all: true },
        }),
        this.prisma.vacancyOffer.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        this.prisma.vacancyResponse.count({
          where: { status: { not: 'withdrawn' } },
        }),
        this.prisma.vacancyResponse.count({
          where: { status: { not: 'withdrawn' }, createdAt: { gte: weekAgo } },
        }),
        this.prisma.vacancyReport.count({ where: { status: 'open' } }),
      ]);

    const liveByKind = Object.fromEntries(
      VACANCY_KINDS.map((kind) => [kind, 0]),
    ) as Record<VacancyKind, number>;
    for (const row of byKind) liveByKind[row.kind] = row._count._all;
    const statusCounts = Object.fromEntries(
      STATUSES.map((status) => [status, 0]),
    ) as Record<VacancyStatus, number>;
    for (const row of byStatus) statusCounts[row.status] = row._count._all;

    return {
      liveByKind,
      byStatus: statusCounts,
      responsesTotal,
      responsesLastWeek,
      openReports,
    };
  }
}
