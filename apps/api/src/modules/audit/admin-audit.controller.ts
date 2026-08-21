import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AccessTokenPayload, AdminAuditQuery } from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { AdminAuditService } from './admin-audit.service';

/** Журнал действий администрации. Портальный раздел: только роль admin. */
@Controller('admin/audit')
@UseGuards(AuthGuard)
export class AdminAuditController {
  constructor(private readonly audit: AdminAuditService) {}

  @Get()
  list(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: AdminAuditQuery,
  ) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Доступ только для администратора');
    }
    return this.audit.list(query);
  }
}
