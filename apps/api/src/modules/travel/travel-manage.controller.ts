import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { TravelBookingStatus } from '@prisma/client';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { TravelManageService } from './travel-manage.service';

const MANAGER_DECISIONS = [
  'accepted',
  'declined',
  'checked_in',
  'completed',
] as const satisfies readonly TravelBookingStatus[];

const STAY_STATUSES = ['draft', 'published', 'hidden_by_author'] as const;

/**
 * Управление своим объектом: хостелом, ашрамом, комнатой. Отдельный
 * контроллер с буквальным префиксом `travel/manage/...` — он регистрируется
 * раньше параметрических маршрутов основного.
 */
@Controller('travel/manage')
@UseGuards(AuthGuard)
export class TravelManageController {
  constructor(private readonly manage: TravelManageService) {}

  @Get('stays')
  stays(@CurrentUser() user: AccessTokenPayload) {
    return this.manage.myStays(user.sub);
  }

  @Post('stays')
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: Record<string, unknown>,
  ) {
    return this.manage.createStay(user.sub, body);
  }

  @Patch('stays/:id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.manage.updateStay(user.sub, id, body);
  }

  @Patch('stays/:id/status')
  setStatus(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: { status?: unknown },
  ) {
    const status = body.status;
    if (
      typeof status !== 'string' ||
      !(STAY_STATUSES as readonly string[]).includes(status)
    ) {
      throw new BadRequestException('Неизвестное состояние объекта');
    }
    return this.manage.setStayStatus(
      user.sub,
      id,
      status as (typeof STAY_STATUSES)[number],
    );
  }

  @Post('stays/:id/rooms')
  addRoom(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.manage.addRoom(user.sub, id, body);
  }

  @Delete('stays/:id/rooms/:roomId')
  @HttpCode(204)
  async removeRoom(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Param('roomId') roomId: string,
  ) {
    await this.manage.removeRoom(user.sub, id, roomId);
  }

  @Get('stays/:id/bookings')
  bookings(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    return this.manage.bookings(user.sub, id);
  }

  @Patch('bookings/:id')
  decide(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: { status?: unknown; declineReason?: unknown },
  ) {
    const status = body.status;
    if (
      typeof status !== 'string' ||
      !(MANAGER_DECISIONS as readonly string[]).includes(status)
    ) {
      throw new BadRequestException('Неизвестное решение по заявке');
    }
    const reason =
      typeof body.declineReason === 'string' && body.declineReason.trim()
        ? body.declineReason.trim().slice(0, 500)
        : null;
    return this.manage.decide(
      user.sub,
      id,
      status as TravelBookingStatus,
      reason,
    );
  }
}
