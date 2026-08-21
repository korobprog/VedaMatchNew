import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  AdminAuditAction,
  AdminAuditDetails,
  AdminAuditEntryDto,
  AdminAuditEvent,
  AdminAuditListResponse,
  AdminAuditQuery,
  AdminAuditTargetType,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { isKnownAuditAction } from './admin-audit-copy';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

@Injectable()
export class AdminAuditService {
  private readonly logger = new Logger(AdminAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Запись в журнал. Никогда не бросает: журнал — наблюдение за действием, а
   * не его часть, и упавшая запись не должна отменять уже сделанное. Ошибка
   * уходит в лог, где её видно вместе с остальными.
   */
  async record(event: AdminAuditEvent): Promise<void> {
    // Сужение типом делает event.action в этой ветке `never`, поэтому строка
    // для лога берётся до проверки.
    const action: string = event.action;
    if (!isKnownAuditAction(event.action)) {
      this.logger.warn(`Неизвестное действие для журнала: ${action}`);
      return;
    }
    try {
      await this.prisma.adminAuditEntry.create({
        data: {
          actorId: event.actorId,
          action: event.action,
          targetType: event.targetType,
          targetId: event.targetId ?? null,
          details: event.details ?? {},
        },
      });
    } catch (error) {
      this.logger.error(
        `Не удалось записать в журнал ${action}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async list(query: AdminAuditQuery): Promise<AdminAuditListResponse> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(query.pageSize) || DEFAULT_PAGE_SIZE),
    );
    const where = buildWhere(query);

    const [rows, total] = await Promise.all([
      this.prisma.adminAuditEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          action: true,
          targetType: true,
          targetId: true,
          details: true,
          actorId: true,
          createdAt: true,
          // Мирское имя: журнал — админский экран, здесь важно понимать,
          // кто именно нажал, а не под каким именем его видят люди.
          actor: { select: { name: true } },
        },
      }),
      this.prisma.adminAuditEntry.count({ where }),
    ]);

    return {
      items: rows.map((row): AdminAuditEntryDto => ({
        id: row.id,
        action: row.action as AdminAuditAction,
        targetType: row.targetType as AdminAuditTargetType,
        targetId: row.targetId,
        details: (row.details ?? {}) as AdminAuditDetails,
        actorId: row.actorId,
        actorName: row.actor?.name ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }
}

/**
 * Фильтры журнала. Отдельной функцией — её и стоит тестировать: перепутанный
 * фильтр показывает не те записи, и это заметят не сразу.
 */
export function buildWhere(
  query: AdminAuditQuery,
): Prisma.AdminAuditEntryWhereInput {
  const where: Prisma.AdminAuditEntryWhereInput = {};
  if (query.action && isKnownAuditAction(query.action)) {
    where.action = query.action;
  }
  if (query.actorId) where.actorId = query.actorId;
  if (query.targetId) where.targetId = query.targetId;
  if (query.since) {
    const since = new Date(query.since);
    if (!Number.isNaN(since.getTime())) where.createdAt = { gte: since };
  }
  return where;
}
