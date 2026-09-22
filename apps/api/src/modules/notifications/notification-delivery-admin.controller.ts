import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  AccessTokenPayload,
  NotificationDeliveryHealthResponse,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { NotificationDeliveryAdminService } from './notification-delivery-admin.service';

/**
 * Живость точек доставки в админке (VED-314). Раньше узнать, есть ли у
 * человека куда доставлять уведомления, можно было только запросом в базу
 * прода по ssh.
 */
@Controller('admin/notifications/delivery')
@UseGuards(AuthGuard)
export class NotificationDeliveryAdminController {
  constructor(private readonly delivery: NotificationDeliveryAdminService) {}

  @Get()
  health(
    @CurrentUser() user: AccessTokenPayload,
    @Query('days') days?: string,
  ): Promise<NotificationDeliveryHealthResponse> {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Доступ только для администратора');
    }
    return this.delivery.health(days ? Number(days) : undefined);
  }
}
