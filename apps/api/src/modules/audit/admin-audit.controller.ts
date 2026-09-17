import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AccessTokenPayload, AdminAuditQuery } from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { isKnownAuditAction } from './admin-audit-copy';
import { actionsForServices } from './audit-action-scope';
import { AdminAuditService } from './admin-audit.service';

/**
 * Журнал действий администрации. `admin` видит всё; `service-admin` видит
 * ровно события своих сервисов (VED-42, карточка вернулась с доработки:
 * право удалять чужое объявление у сервисного админа уже было, а посмотреть
 * запись об этом — нет). Обычный пользователь не проходит дальше.
 */
@Controller('admin/audit')
@UseGuards(AuthGuard)
export class AdminAuditController {
  constructor(private readonly audit: AdminAuditService) {}

  @Get()
  list(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: AdminAuditQuery,
  ) {
    if (user.role === 'admin') {
      return this.audit.list(query);
    }

    const services = user.adminServices ?? [];
    if (user.role !== 'service-admin' || services.length === 0) {
      throw new ForbiddenException('Доступ только для администратора');
    }

    const scopeActions = actionsForServices(services);
    // Конкретное действие запрошено явно — если оно вообще существует и не
    // входит в список видимых этому админу, отказ адресный (это действие),
    // а не весь журнал: мусорную строку в query просто игнорируем, как и
    // полный admin (см. buildWhere/isKnownAuditAction).
    if (
      query.action &&
      isKnownAuditAction(query.action) &&
      !scopeActions.includes(query.action)
    ) {
      throw new ForbiddenException('Действие относится к чужому сервису');
    }

    return this.audit.list(query, scopeActions);
  }
}
