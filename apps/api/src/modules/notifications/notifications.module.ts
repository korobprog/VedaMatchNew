import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationBroadcastController } from './notification-broadcast.controller';
import { NotificationBroadcastWorkerService } from './notification-broadcast-worker.service';
import { NotificationBroadcastService } from './notification-broadcast.service';
import { FcmSenderService } from './fcm-sender.service';
import { NativePushService } from './native-push.service';
import { NotificationDevicesAdminController } from './notification-devices-admin.controller';
import { NotificationsController } from './notifications.controller';
import { NotificationsListener } from './notifications.listener';
import { NotificationsService } from './notifications.service';
import { PushSenderService } from './push-sender.service';

@Module({
  imports: [AuthModule],
  controllers: [
    NotificationsController,
    NotificationBroadcastController,
    NotificationDevicesAdminController,
  ],
  providers: [
    NotificationsService,
    PushSenderService,
    FcmSenderService,
    NativePushService,
    NotificationsListener,
    NotificationBroadcastService,
    NotificationBroadcastWorkerService,
  ],
})
export class NotificationsModule {}
