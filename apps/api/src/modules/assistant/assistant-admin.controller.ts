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
  AssistantAdminUsageDto,
  AssistantSettingsDto,
  UpdateAssistantSettingsRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { AssistantAdminService } from './assistant-admin.service';
import { isAdmin } from './is-admin';

/**
 * Админка ассистента. Роль проверяется в каждом методе: AuthGuard
 * подтверждает только вход, но не права.
 */
@Controller('admin/assistant')
@UseGuards(AuthGuard)
export class AssistantAdminController {
  constructor(
    private readonly admin: AssistantAdminService,
    private readonly events: EventEmitter2,
  ) {}

  @Get('settings')
  settings(
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<AssistantSettingsDto> {
    this.assertAdmin(user);
    return this.admin.settingsState();
  }

  @Patch('settings')
  async update(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: UpdateAssistantSettingsRequest,
  ): Promise<AssistantSettingsDto> {
    this.assertAdmin(user);
    const next = await this.admin.updateSettings(body ?? {});
    const event: AdminAuditEvent = {
      actorId: user.sub,
      action: 'assistant.settings-changed',
      targetType: 'platform',
    };
    this.events.emit('admin.action', event);
    return next;
  }

  @Get('usage')
  usage(
    @CurrentUser() user: AccessTokenPayload,
    @Query('days') days?: string,
  ): Promise<AssistantAdminUsageDto> {
    this.assertAdmin(user);
    return this.admin.usage(days ? Number(days) : undefined);
  }

  /** Снять аварийную остановку до конца суток. */
  @Post('resume')
  resume(
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<AssistantAdminUsageDto> {
    this.assertAdmin(user);
    const event: AdminAuditEvent = {
      actorId: user.sub,
      action: 'assistant.generation-resumed',
      targetType: 'platform',
    };
    this.events.emit('admin.action', event);
    return this.admin.resume();
  }

  private assertAdmin(user: AccessTokenPayload): void {
    if (!isAdmin(user))
      throw new ForbiddenException('Доступ только для администратора');
  }
}
