import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { isAdmin } from './is-admin';
import { TravelAdminService } from './travel-admin.service';

const ADMIN_STAY_STATUSES = ['removed_by_admin', 'published', 'draft'] as const;

/**
 * Админский раздел сервиса. Буквальный путь `travel/admin/...`, поэтому
 * контроллер регистрируется раньше параметрических маршрутов основного.
 */
@Controller('travel/admin')
@UseGuards(AuthGuard)
export class TravelAdminController {
  constructor(private readonly admin: TravelAdminService) {}

  @Get('places')
  places(@CurrentUser() user: AccessTokenPayload) {
    this.assertAdmin(user);
    return this.admin.places();
  }

  @Post('places')
  createPlace(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: Record<string, unknown>,
  ) {
    this.assertAdmin(user);
    return this.admin.createPlace(body);
  }

  @Delete('places/:id')
  @HttpCode(204)
  async removePlace(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    this.assertAdmin(user);
    await this.admin.removePlace(id);
  }

  @Get('stays')
  stays(@CurrentUser() user: AccessTokenPayload) {
    this.assertAdmin(user);
    return this.admin.stays();
  }

  @Patch('stays/:id/status')
  setStayStatus(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: { status?: unknown },
  ) {
    this.assertAdmin(user);
    const status = body.status;
    if (
      typeof status !== 'string' ||
      !(ADMIN_STAY_STATUSES as readonly string[]).includes(status)
    ) {
      throw new BadRequestException('Неизвестное состояние объекта');
    }
    return this.admin.setStayStatus(
      id,
      status as (typeof ADMIN_STAY_STATUSES)[number],
    );
  }

  private assertAdmin(user: AccessTokenPayload): void {
    if (!isAdmin(user)) throw new ForbiddenException('Нужны права админа');
  }
}
