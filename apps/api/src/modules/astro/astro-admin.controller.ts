import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type {
  AccessTokenPayload,
  AdminAuditEvent,
  AstroAdminUsageDto,
  AstroSettingsDto,
  UpdateAstroSettingsRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { AstroAdminService } from './astro-admin.service';
import { isAdmin } from './is-admin';

/**
 * Админка сервиса. Роль проверяется в каждом методе, как в AdminBillingModeController:
 * AuthGuard подтверждает только вход, но не права.
 */
@Controller('admin/astro')
@UseGuards(AuthGuard)
export class AstroAdminController {
  constructor(
    private readonly admin: AstroAdminService,
    private readonly events: EventEmitter2,
  ) {}

  @Get('settings')
  settings(@CurrentUser() user: AccessTokenPayload): Promise<AstroSettingsDto> {
    this.assertAdmin(user);
    return this.admin.settingsState();
  }

  @Patch('settings')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: UpdateAstroSettingsRequest,
  ): Promise<AstroSettingsDto> {
    this.assertAdmin(user);
    return this.admin.updateSettings(body);
  }

  @Get('usage')
  usage(
    @CurrentUser() user: AccessTokenPayload,
    @Query('days') days?: string,
  ): Promise<AstroAdminUsageDto> {
    this.assertAdmin(user);
    return this.admin.usage(days ? Number(days) : undefined);
  }

  /** Снять аварийную остановку до конца суток. */
  @Post('resume')
  resume(@CurrentUser() user: AccessTokenPayload): Promise<AstroAdminUsageDto> {
    this.assertAdmin(user);
    const event: AdminAuditEvent = {
      actorId: user.sub,
      action: 'astro.generation-resumed',
      targetType: 'platform',
    };
    this.events.emit('admin.action', event);
    return this.admin.resume();
  }

  private assertAdmin(user: AccessTokenPayload): void {
    if (!isAdmin(user)) {
      throw new ForbiddenException('Доступ только для администратора');
    }
  }
}
