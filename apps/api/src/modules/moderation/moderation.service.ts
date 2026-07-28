import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  Role,
  AdminUpdateUserReportRequest,
  AdminUserReportDto,
  AdminUserReportsResponse,
  CreateUserReportRequest,
  UserBlocksState,
  UserReportReason,
  UserReportStatus,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

const REPORT_REASONS: UserReportReason[] = [
  'spam',
  'harassment',
  'fake_profile',
  'inappropriate_content',
  'offline_safety',
  'other',
];
const REPORT_STATUSES: UserReportStatus[] = ['open', 'reviewed', 'dismissed'];
const MAX_COMMENT_LENGTH = 1000;

@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Идентификаторы, которых нельзя показывать пользователю: он заблокировал их
   * либо они заблокировали его. Блокировка симметрична по видимости.
   */
  async hiddenUserIds(userId: string): Promise<Set<string>> {
    const blocks = await this.prisma.userBlock.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    return new Set(
      blocks.map((block) =>
        block.blockerId === userId ? block.blockedId : block.blockerId,
      ),
    );
  }

  async isHidden(userId: string, otherUserId: string): Promise<boolean> {
    const block = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: otherUserId },
          { blockerId: otherUserId, blockedId: userId },
        ],
      },
      select: { id: true },
    });
    return block !== null;
  }

  async listBlocks(userId: string): Promise<UserBlocksState> {
    const blocks = await this.prisma.userBlock.findMany({
      where: { blockerId: userId },
      include: { blocked: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return {
      blocked: blocks.map((block) => ({
        userId: block.blocked.id,
        name: block.blocked.name,
        createdAt: block.createdAt.toISOString(),
      })),
    };
  }

  async block(userId: string, targetId: string): Promise<UserBlocksState> {
    if (userId === targetId) {
      throw new BadRequestException('Нельзя заблокировать самого себя');
    }
    await this.requireUser(targetId);

    await this.prisma.$transaction([
      this.prisma.userBlock.upsert({
        where: {
          blockerId_blockedId: { blockerId: userId, blockedId: targetId },
        },
        create: { blockerId: userId, blockedId: targetId },
        update: {},
      }),
      // Открытые заявки между участниками теряют смысл после блокировки.
      this.prisma.unionConnectionRequest.updateMany({
        where: {
          status: 'pending',
          OR: [
            { fromUserId: userId, toUserId: targetId },
            { fromUserId: targetId, toUserId: userId },
          ],
        },
        data: { status: 'cancelled', respondedAt: new Date() },
      }),
    ]);

    return this.listBlocks(userId);
  }

  async unblock(userId: string, targetId: string): Promise<UserBlocksState> {
    await this.prisma.userBlock.deleteMany({
      where: { blockerId: userId, blockedId: targetId },
    });
    return this.listBlocks(userId);
  }

  async report(
    reporterId: string,
    targetId: string,
    body: CreateUserReportRequest,
  ): Promise<{ ok: true }> {
    if (reporterId === targetId) {
      throw new BadRequestException('Нельзя пожаловаться на самого себя');
    }
    if (!REPORT_REASONS.includes(body?.reason)) {
      throw new BadRequestException('Укажите причину жалобы');
    }
    const comment = body.comment?.trim() || null;
    if (comment && comment.length > MAX_COMMENT_LENGTH) {
      throw new BadRequestException(
        `Комментарий не длиннее ${MAX_COMMENT_LENGTH} символов`,
      );
    }
    await this.requireUser(targetId);

    await this.prisma.userReport.create({
      data: { reporterId, targetId, reason: body.reason, comment },
    });
    return { ok: true };
  }

  async adminList(
    role: Role,
    status?: string,
  ): Promise<AdminUserReportsResponse> {
    this.ensureAdmin(role);
    const filter = REPORT_STATUSES.includes(status as UserReportStatus)
      ? (status as UserReportStatus)
      : undefined;

    const [reports, openCount] = await Promise.all([
      this.prisma.userReport.findMany({
        where: filter ? { status: filter } : undefined,
        include: {
          reporter: { select: { id: true, name: true, email: true } },
          target: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: 200,
      }),
      this.prisma.userReport.count({ where: { status: 'open' } }),
    ]);

    const counts = await this.prisma.userReport.groupBy({
      by: ['targetId'],
      where: { targetId: { in: reports.map((report) => report.targetId) } },
      _count: { _all: true },
    });
    const countByTarget = new Map(
      counts.map((row) => [row.targetId, row._count._all]),
    );

    return {
      items: reports.map((report): AdminUserReportDto => ({
        id: report.id,
        reason: report.reason,
        comment: report.comment,
        status: report.status,
        createdAt: report.createdAt.toISOString(),
        reviewedAt: report.reviewedAt?.toISOString() ?? null,
        moderatorNote: report.moderatorNote,
        reporter: report.reporter,
        target: report.target,
        targetReportCount: countByTarget.get(report.targetId) ?? 1,
      })),
      openCount,
    };
  }

  async adminUpdate(
    moderator: { sub: string; role: Role },
    reportId: string,
    body: AdminUpdateUserReportRequest,
  ): Promise<{ ok: true }> {
    this.ensureAdmin(moderator.role);
    if (!REPORT_STATUSES.includes(body?.status)) {
      throw new BadRequestException('Недопустимый статус жалобы');
    }
    const note = body.moderatorNote?.trim() || null;
    if (note && note.length > MAX_COMMENT_LENGTH) {
      throw new BadRequestException(
        `Заметка не длиннее ${MAX_COMMENT_LENGTH} символов`,
      );
    }

    const report = await this.prisma.userReport.findUnique({
      where: { id: reportId },
      select: { id: true },
    });
    if (!report) throw new NotFoundException('Жалоба не найдена');

    await this.prisma.userReport.update({
      where: { id: reportId },
      data: {
        status: body.status,
        moderatorNote: note,
        reviewedAt: body.status === 'open' ? null : new Date(),
        reviewedById: body.status === 'open' ? null : moderator.sub,
      },
    });
    return { ok: true };
  }

  private ensureAdmin(role: Role): void {
    if (role !== 'admin') {
      throw new ForbiddenException('Доступ только для администратора');
    }
  }

  private async requireUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Пользователь не найден');
  }
}
