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
import type {
  AccessTokenPayload,
  AstroAdminUsageDto,
  AstroSettingsDto,
  UpdateAstroSettingsRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { AstroAdminService } from './astro-admin.service';

/**
 * Админка сервиса. Роль проверяется в каждом методе, как в AdminBillingModeController:
 * AuthGuard подтверждает только вход, но не права.
 */
@Controller('admin/astro')
@UseGuards(AuthGuard)
export class AstroAdminController {
  constructor(private readonly admin: AstroAdminService) {}

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
    return this.admin.resume();
  }

  private assertAdmin(user: AccessTokenPayload): void {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Доступ только для администратора');
    }
  }
}
