import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AdminAuditEvent,
  Role,
  AdminUpdateUserReportRequest,
  AdminUserReportDto,
  AdminUserReportsResponse,
  CreateUserReportRequest,
  UserBlocksState,
  UserHiddenState,
  UserHideScope,
  UserHideSource,
  UserReportReason,
  UserReportStatus,
} from '@vedamatch/shared';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Идентификаторы, которых нельзя показывать пользователю: симметричные
   * блокировки плюс односторонние скрытия, где он выступает зрителем.
   * `scope` — сервис, который спрашивает; записи `all` действуют везде.
   */
  async hiddenUserIds(
    userId: string,
    scope: UserHideScope = 'all',
  ): Promise<Set<string>> {
    const [blocks, hidden] = await Promise.all([
      this.prisma.userBlock.findMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
        select: { blockerId: true, blockedId: true },
      }),
      this.prisma.userHiddenFrom.findMany({
        where: this.hiddenWhere(userId, scope),
        select: { ownerId: true },
      }),
    ]);
    return new Set([
      ...blocks.map((block) =>
        block.blockerId === userId ? block.blockedId : block.blockerId,
      ),
      ...hidden.map((row) => row.ownerId),
    ]);
  }

  async isHidden(
    userId: string,
    otherUserId: string,
    scope: UserHideScope = 'all',
  ): Promise<boolean> {
    const [block, hidden] = await Promise.all([
      this.prisma.userBlock.findFirst({
        where: {
          OR: [
            { blockerId: userId, blockedId: otherUserId },
            { blockerId: otherUserId, blockedId: userId },
          ],
        },
        select: { id: true },
      }),
      this.prisma.userHiddenFrom.findFirst({
        where: { ...this.hiddenWhere(userId, scope), ownerId: otherUserId },
        select: { id: true },
      }),
    ]);
    return block !== null || hidden !== null;
  }

  /**
   * Скрыть `ownerId` от `viewerId`. Направление одностороннее: отказ по заявке
   * прячет отказавшего от отправителя, но не наоборот — отказавший может
   * передумать и найти человека сам.
   */
  async hideFrom(params: {
    ownerId: string;
    viewerId: string;
    source: UserHideSource;
    scope?: UserHideScope;
    expiresAt?: Date | null;
  }): Promise<void> {
    const { ownerId, viewerId, source } = params;
    if (ownerId === viewerId) {
      throw new BadRequestException('Нельзя скрыть человека от самого себя');
    }
    const scope = params.scope ?? 'all';
    const expiresAt = params.expiresAt ?? null;

    await this.prisma.userHiddenFrom.upsert({
      where: { ownerId_viewerId_scope: { ownerId, viewerId, scope } },
      create: { ownerId, viewerId, scope, source, expiresAt },
      // Повторное скрытие продлевает запись: истёкшая не должна оставаться истёкшей.
      update: { source, expiresAt },
    });
  }

  async unhideFrom(
    ownerId: string,
    viewerId: string,
    scope: UserHideScope = 'all',
  ): Promise<void> {
    await this.prisma.userHiddenFrom.deleteMany({
      where: { ownerId, viewerId, scope },
    });
  }

  /** Кого текущий пользователь сам убрал из своей выдачи. */
  async listHidden(viewerId: string): Promise<UserHiddenState> {
    const rows = await this.prisma.userHiddenFrom.findMany({
      where: { viewerId, source: 'manual' },
      include: { owner: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return {
      hidden: rows.map((row) => ({
        userId: row.owner.id,
        name: row.owner.name,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  /** Человек убирает кого-то из своей выдачи — мягкая альтернатива блокировке. */
  async hide(viewerId: string, targetId: string): Promise<UserHiddenState> {
    if (viewerId === targetId) {
      throw new BadRequestException('Нельзя скрыть самого себя');
    }
    await this.requireUser(targetId);
    await this.hideFrom({
      ownerId: targetId,
      viewerId,
      source: 'manual',
    });
    return this.listHidden(viewerId);
  }

  async unhide(viewerId: string, targetId: string): Promise<UserHiddenState> {
    await this.unhideFrom(targetId, viewerId);
    return this.listHidden(viewerId);
  }

  /**
   * Условие выборки действующих скрытий: записи своего скоупа и `all`,
   * у которых не вышел срок.
   */
  private hiddenWhere(viewerId: string, scope: UserHideScope) {
    const scopes: UserHideScope[] = scope === 'all' ? ['all'] : ['all', scope];
    return {
      viewerId,
      scope: { in: scopes },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    };
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

    const event: AdminAuditEvent = {
      actorId: moderator.sub,
      action: 'report.resolved',
      targetType: 'report',
      targetId: reportId,
      details: { status: body.status, note },
    };
    this.events.emit('admin.action', event);
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
