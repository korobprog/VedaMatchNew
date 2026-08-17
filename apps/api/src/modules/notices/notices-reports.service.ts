import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NOTICE_REPORT_NOTE_MAX_LENGTH,
  type AdminNoticeReportDecisionRequest,
  type AdminNoticeReportsResponse,
  type CreateNoticeReportRequest,
  type NoticeReportReason,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
// Роли общины — портальная инфраструктура, читать её разрешено;
// см. docs/service-module-contract.md.
import { canModerateCommunityContent } from '../communities/community-roles';
import { detectCommerce } from './notice-commerce-guard';
import { crossesHideThreshold } from './report-threshold';

const REASONS: NoticeReportReason[] = [
  'spam',
  'commercial',
  'mlm',
  'duplicate',
  'scam',
  'inappropriate_content',
  'wrong_rubric',
  'other',
];

@Injectable()
export class NoticesReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async report(
    userId: string,
    noticeId: string,
    body: CreateNoticeReportRequest,
  ): Promise<{ ok: true }> {
    if (!REASONS.includes(body.reason))
      throw new BadRequestException('Неизвестная причина жалобы');
    const note = body.note?.trim() || null;
    if (note && note.length > NOTICE_REPORT_NOTE_MAX_LENGTH)
      throw new BadRequestException('Комментарий слишком длинный');

    const notice = await this.prisma.notice.findUnique({
      where: { id: noticeId },
      select: { id: true, authorId: true, status: true },
    });
    if (!notice) throw new NotFoundException('Объявление не найдено');
    if (notice.authorId === userId)
      throw new BadRequestException('Это ваше объявление');

    const existing = await this.prisma.noticeReport.findUnique({
      where: { reporterId_noticeId: { reporterId: userId, noticeId } },
      select: { id: true },
    });
    // Один человек жалуется один раз: повторная жалоба не должна двигать
    // порог автоскрытия.
    if (existing) throw new BadRequestException('Вы уже пожаловались');

    await this.prisma.noticeReport.create({
      data: { reporterId: userId, noticeId, reason: body.reason, note },
    });

    const openReportsCount = await this.prisma.noticeReport.count({
      where: { noticeId, status: 'open' },
    });
    await this.prisma.notice.update({
      where: { id: noticeId },
      data: {
        openReportsCount,
        // Скрываем ровно на пороге, а не при `>=`: иначе объявление
        // пряталось бы снова после того, как админ его вернул.
        ...(crossesHideThreshold(openReportsCount) &&
        notice.status === 'published'
          ? { status: 'hidden_by_reports' as const }
          : {}),
      },
    });
    return { ok: true };
  }

  /**
   * Скрытие объявления администрацией общины.
   *
   * Делегирование — единственный способ, которым доска масштабируется без
   * штата модераторов: жалобу на объявление своей ятры разбирает её же
   * админ, а не портальная администрация.
   *
   * Права намеренно узкие: скрыть можно только объявление, привязанное к
   * этой общине, и только скрыть — снять насовсем или вернуть в ленту
   * по-прежнему может лишь портальный админ.
   */
  async communityHide(
    userId: string,
    noticeId: string,
    moderatorNote: string | null,
  ): Promise<{ ok: true }> {
    const notice = await this.prisma.notice.findUnique({
      where: { id: noticeId },
      select: { id: true, communityId: true, status: true },
    });
    if (!notice) throw new NotFoundException('Объявление не найдено');
    if (!notice.communityId)
      throw new ForbiddenException('Объявление не привязано к общине');

    const membership = await this.prisma.communityMember.findUnique({
      where: {
        communityId_userId: { communityId: notice.communityId, userId },
      },
      select: { role: true, status: true },
    });
    if (!canModerateCommunityContent(membership))
      throw new ForbiddenException('Нет прав модератора в этой общине');

    await this.prisma.notice.update({
      where: { id: noticeId },
      data: {
        status: 'hidden_by_reports',
        moderatorNote: moderatorNote?.trim() || null,
      },
    });
    return { ok: true };
  }

  async adminList(status = 'open'): Promise<AdminNoticeReportsResponse> {
    const where =
      status === 'all'
        ? {}
        : { status: status as 'open' | 'reviewed' | 'dismissed' };
    const [rows, openCount] = await Promise.all([
      this.prisma.noticeReport.findMany({
        where,
        include: {
          notice: {
            select: {
              id: true,
              titleRu: true,
              titleEn: true,
              descriptionRu: true,
              status: true,
              // В админке осознанно мирское имя: по духовному нельзя понять,
              // кто перед тобой — см. контракт, «Имя пользователя наружу».
              author: { select: { name: true } },
            },
          },
          reporter: { select: { name: true } },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 100,
      }),
      this.prisma.noticeReport.count({ where: { status: 'open' } }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        noticeId: row.noticeId,
        noticeTitle: row.notice.titleRu ?? row.notice.titleEn ?? 'Без названия',
        noticeStatus: row.notice.status,
        // Подсказка модератору: за что зацепилась автопроверка на коммерцию.
        commerceHits: detectCommerce(
          row.notice.titleRu ?? row.notice.titleEn,
          row.notice.descriptionRu,
        ).hits,
        reason: row.reason,
        note: row.note,
        status: row.status,
        reporterName: row.reporter.name,
        authorName: row.notice.author.name,
        createdAt: row.createdAt.toISOString(),
      })),
      openCount,
    };
  }

  async decide(
    adminId: string,
    reportId: string,
    body: AdminNoticeReportDecisionRequest,
  ): Promise<{ ok: true }> {
    const report = await this.prisma.noticeReport.findUnique({
      where: { id: reportId },
      select: { id: true, noticeId: true },
    });
    if (!report) throw new NotFoundException('Жалоба не найдена');

    const now = new Date();
    const noticeData = this.noticeUpdateFor(body, now);

    await this.prisma.$transaction(async (tx) => {
      await tx.noticeReport.update({
        where: { id: reportId },
        data: {
          status: body.decision === 'dismiss' ? 'dismissed' : 'reviewed',
          reviewedById: adminId,
          reviewedAt: now,
          moderatorNote: body.moderatorNote?.trim() || null,
        },
      });
      if (noticeData)
        await tx.notice.update({
          where: { id: report.noticeId },
          data: noticeData,
        });
      // Счётчик считаем в той же транзакции: иначе объявление, возвращённое
      // админом, осталось бы с прежним числом открытых жалоб и скрылось бы
      // на следующей же.
      const openReportsCount = await tx.noticeReport.count({
        where: { noticeId: report.noticeId, status: 'open' },
      });
      await tx.notice.update({
        where: { id: report.noticeId },
        data: { openReportsCount },
      });
    });
    return { ok: true };
  }

  private noticeUpdateFor(body: AdminNoticeReportDecisionRequest, now: Date) {
    const moderatorNote = body.moderatorNote?.trim() || null;
    switch (body.decision) {
      case 'hide':
        return { status: 'removed_by_admin' as const, moderatorNote };
      case 'suggest_market':
        // Автоматического переноса в Рынок нет и быть не может: связь с
        // моделями чужого сервиса запрещена контрактом. Автор переносит
        // текст сам по ссылке из уведомления.
        return {
          status: 'moved_to_market' as const,
          marketMoveSuggestedAt: now,
          moderatorNote,
        };
      case 'restore':
        return {
          status: 'published' as const,
          moderatorNote,
          needsReview: false,
        };
      case 'dismiss':
      default:
        return null;
    }
  }
}
