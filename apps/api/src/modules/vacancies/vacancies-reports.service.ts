import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  VACANCY_MODERATOR_NOTE_MAX_LENGTH,
  VACANCY_REPORT_NOTE_MAX_LENGTH,
  type AdminVacancyReportDecisionRequest,
  type AdminVacancyReportDto,
  type AdminVacancyReportsResponse,
  type CreateVacancyReportRequest,
  type VacancyReportReason,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { crossesHideThreshold } from './report-threshold';

const REASONS: VacancyReportReason[] = [
  'spam',
  'scam',
  'misleading',
  'not_community',
  'inappropriate_content',
  'duplicate',
  'other',
];

const REPORT_INCLUDE = {
  offer: {
    select: {
      id: true,
      title: true,
      kind: true,
      status: true,
      author: { select: { name: true } },
    },
  },
  // Мирское имя намеренно: в админке нужно понимать, кто перед тобой.
  reporter: { select: { name: true } },
} as const;

@Injectable()
export class VacanciesReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async report(
    userId: string,
    offerId: string,
    body: CreateVacancyReportRequest,
  ): Promise<{ ok: true }> {
    if (!REASONS.includes(body.reason))
      throw new BadRequestException('Неизвестная причина жалобы');
    const note = body.note?.trim() || null;
    if (note && note.length > VACANCY_REPORT_NOTE_MAX_LENGTH)
      throw new BadRequestException('Комментарий слишком длинный');

    const offer = await this.prisma.vacancyOffer.findUnique({
      where: { id: offerId },
      select: { id: true, authorId: true, status: true },
    });
    if (!offer) throw new NotFoundException('Предложение не найдено');
    if (offer.authorId === userId)
      throw new BadRequestException('Это ваше предложение');

    const existing = await this.prisma.vacancyReport.findUnique({
      where: { reporterId_offerId: { reporterId: userId, offerId } },
      select: { id: true },
    });
    // Один человек жалуется один раз: повторная жалоба не двигает порог.
    if (existing) throw new BadRequestException('Вы уже пожаловались');

    // Жалоба, счётчик и автоскрытие — одной транзакцией.
    await this.prisma.$transaction(async (tx) => {
      await tx.vacancyReport.create({
        data: { reporterId: userId, offerId, reason: body.reason, note },
      });
      const openReportsCount = await tx.vacancyReport.count({
        where: { offerId, status: 'open' },
      });
      const hide =
        crossesHideThreshold(openReportsCount) && offer.status === 'published';
      await tx.vacancyOffer.update({
        where: { id: offerId },
        data: {
          openReportsCount,
          ...(hide ? { status: 'hidden_by_reports' as const } : {}),
        },
      });
    });
    return { ok: true };
  }

  async adminList(status?: string): Promise<AdminVacancyReportsResponse> {
    const where: Prisma.VacancyReportWhereInput =
      status === 'open' || status === 'reviewed' || status === 'dismissed'
        ? { status }
        : {};
    const [rows, openCount] = await Promise.all([
      this.prisma.vacancyReport.findMany({
        where,
        include: REPORT_INCLUDE,
        orderBy: [{ createdAt: 'desc' }],
        take: 200,
      }),
      this.prisma.vacancyReport.count({ where: { status: 'open' } }),
    ]);
    return { items: rows.map(toAdminDto), openCount };
  }

  /**
   * Решение по жалобе. `hide` скрывает предложение и закрывает все открытые
   * жалобы на него разом: модератор разбирает предложение, а не каждую
   * жалобу по отдельности. `remove` — то же, но насовсем. `dismiss`
   * отклоняет одну жалобу и, когда открытых не осталось, возвращает
   * автоскрытое предложение в ленту.
   */
  async decide(
    adminId: string,
    reportId: string,
    body: AdminVacancyReportDecisionRequest,
  ): Promise<{ ok: true }> {
    const note = body.moderatorNote?.trim() || null;
    if (note && note.length > VACANCY_MODERATOR_NOTE_MAX_LENGTH)
      throw new BadRequestException('Комментарий слишком длинный');
    const report = await this.prisma.vacancyReport.findUnique({
      where: { id: reportId },
      select: { id: true, offerId: true, status: true },
    });
    if (!report) throw new NotFoundException('Жалоба не найдена');

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      if (body.decision === 'dismiss') {
        await tx.vacancyReport.update({
          where: { id: reportId },
          data: { status: 'dismissed', reviewedById: adminId, reviewedAt: now },
        });
      } else {
        // hide, remove, restore — решение по предложению, а не по жалобе:
        // все открытые жалобы на него закрываются разом.
        await tx.vacancyReport.updateMany({
          where: { offerId: report.offerId, status: 'open' },
          data: { status: 'reviewed', reviewedById: adminId, reviewedAt: now },
        });
      }
      const openReportsCount = await tx.vacancyReport.count({
        where: { offerId: report.offerId, status: 'open' },
      });
      const offer = await tx.vacancyOffer.findUnique({
        where: { id: report.offerId },
        select: { status: true },
      });
      if (!offer) return;
      const status =
        body.decision === 'remove'
          ? 'removed_by_admin'
          : body.decision === 'hide'
            ? 'hidden_by_reports'
            : body.decision === 'restore'
              ? 'published'
              : offer.status === 'hidden_by_reports' && openReportsCount === 0
                ? 'published'
                : offer.status;
      await tx.vacancyOffer.update({
        where: { id: report.offerId },
        data: {
          openReportsCount,
          status,
          ...(body.decision === 'restore'
            ? { moderatorNote: null }
            : body.decision !== 'dismiss'
              ? { moderatorNote: note }
              : {}),
        },
      });
    });
    return { ok: true };
  }
}

type ReportRow = {
  id: string;
  offerId: string;
  reason: VacancyReportReason;
  note: string | null;
  status: AdminVacancyReportDto['status'];
  createdAt: Date;
  offer: {
    title: string;
    kind: AdminVacancyReportDto['offerKind'];
    status: AdminVacancyReportDto['offerStatus'];
    author: { name: string };
  };
  reporter: { name: string };
};

function toAdminDto(row: ReportRow): AdminVacancyReportDto {
  return {
    id: row.id,
    offerId: row.offerId,
    offerTitle: row.offer.title,
    offerKind: row.offer.kind,
    offerStatus: row.offer.status,
    reason: row.reason,
    note: row.note,
    status: row.status,
    reporterName: row.reporter.name,
    authorName: row.offer.author.name,
    createdAt: row.createdAt.toISOString(),
  };
}
