import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationBroadcastController } from './notification-broadcast.controller';
import { NotificationBroadcastWorkerService } from './notification-broadcast-worker.service';
import { NotificationBroadcastService } from './notification-broadcast.service';
import { FcmSenderService } from './fcm-sender.service';
import { NativePushService } from './native-push.service';
import { NotificationDeliveryAdminController } from './notification-delivery-admin.controller';
import { NotificationDeliveryAdminService } from './notification-delivery-admin.service';
import { NotificationDevicesAdminController } from './notification-devices-admin.controller';
import { NotificationPurgeWorkerService } from './notification-purge-worker.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsListener } from './notifications.listener';
import { NotificationsService } from './notifications.service';
import { PushSenderService } from './push-sender.service';
import { TelegramNotificationsController } from './telegram-notifications.controller';
import { TelegramNotificationsService } from './telegram-notifications.service';
import { TelegramSenderService } from './telegram-sender.service';

@Module({
  imports: [AuthModule],
  controllers: [
    NotificationsController,
    NotificationBroadcastController,
    NotificationDevicesAdminController,
    NotificationDeliveryAdminController,
    TelegramNotificationsController,
  ],
  providers: [
    NotificationsService,
    NotificationDeliveryAdminService,
    PushSenderService,
    FcmSenderService,
    NativePushService,
    NotificationsListener,
    NotificationBroadcastService,
    NotificationBroadcastWorkerService,
    NotificationPurgeWorkerService,
    TelegramNotificationsService,
    TelegramSenderService,
  ],
})
export class NotificationsModule {}
