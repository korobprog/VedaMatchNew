import {
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
import { EventEmitter2 } from '@nestjs/event-emitter';
import type {
  AccessTokenPayload,
  AdminAuditEvent,
  CreateNotificationBroadcastRequest,
  NotificationAudienceFilter,
  UpdateNotificationBroadcastRequest,
} from '@vedamatch/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { NotificationBroadcastWorkerService } from './notification-broadcast-worker.service';
import { NotificationBroadcastService } from './notification-broadcast.service';

/**
 * Рассылки администрации. Портальный раздел: доступ только у роли `admin` —
 * администратор сервиса не должен писать всему порталу от лица платформы.
 */
@Controller('admin/notifications/broadcasts')
@UseGuards(AuthGuard)
export class NotificationBroadcastController {
  constructor(
    private readonly broadcasts: NotificationBroadcastService,
    private readonly worker: NotificationBroadcastWorkerService,
    private readonly events: EventEmitter2,
  ) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload) {
    this.assertAdmin(user);
    return this.broadcasts.list();
  }

  /** Сколько человек попадёт под фильтр. POST, потому что фильтр — тело. */
  @Post('preview')
  @HttpCode(200)
  preview(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: { audience?: NotificationAudienceFilter },
  ) {
    this.assertAdmin(user);
    return this.broadcasts.preview(body?.audience);
  }

  @Get(':id')
  byId(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    this.assertAdmin(user);
    return this.broadcasts.byId(id);
  }

  @Post()
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() body: CreateNotificationBroadcastRequest,
  ) {
    this.assertAdmin(user);
    return this.broadcasts.create(user.sub, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() body: UpdateNotificationBroadcastRequest,
  ) {
    this.assertAdmin(user);
    return this.broadcasts.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    this.assertAdmin(user);
    await this.broadcasts.remove(id);
  }

  /**
   * Запуск. Отправку делает воркер, но тик дёргается сразу: ждать до минуты
   * после нажатия «Отправить» — повод решить, что кнопка не сработала.
   */
  @Post(':id/send')
  async send(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string) {
    this.assertAdmin(user);
    const started = await this.broadcasts.start(id);
    this.audit(user.sub, 'broadcast.sent', started.id, {
      title: started.title,
      recipients: started.totalRecipients,
      important: started.important,
    });
    void this.worker.tick();
    return started;
  }

  @Post(':id/cancel')
  async cancel(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    this.assertAdmin(user);
    const cancelled = await this.broadcasts.cancel(id);
    this.audit(user.sub, 'broadcast.cancelled', id, {
      title: cancelled.title,
      // Сколько успело уйти до остановки — это и есть цена ошибки.
      recipients: cancelled.deliveredCount,
    });
    return cancelled;
  }

  private audit(
    actorId: string,
    action: AdminAuditEvent['action'],
    broadcastId: string,
    details: AdminAuditEvent['details'],
  ): void {
    const event: AdminAuditEvent = {
      actorId,
      action,
      targetType: 'broadcast',
      targetId: broadcastId,
      details,
    };
    this.events.emit('admin.action', event);
  }

  private assertAdmin(user: AccessTokenPayload): void {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Доступ только для администратора');
    }
  }
}
