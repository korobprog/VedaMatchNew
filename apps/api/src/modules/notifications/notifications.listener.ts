import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { NotificationEvent } from '@vedamatch/shared';
import { notificationEventNames } from '@vedamatch/shared';
import { buildNotification } from './notification-copy';
import { NotificationsService } from './notifications.service';
import { PushSenderService } from './push-sender.service';

@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly sender: PushSenderService,
  ) {}

  @OnEvent(notificationEventNames.chatMessageSent)
  onChatMessage(event: NotificationEvent): void {
    // Без await: отправка пуша не должна удлинять ответ на исходный запрос.
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.connectionRequested)
  onConnectionRequested(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.connectionAccepted)
  onConnectionAccepted(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.supportReplied)
  onSupportReplied(event: NotificationEvent): void {
    void this.deliver(event);
  }

  /**
   * Всегда резолвится. Необработанное отклонение в слушателе EventEmitter'а
   * роняет процесс, а недоступный пуш-сервис — не повод ронять API.
   */
  async deliver(event: NotificationEvent): Promise<void> {
    try {
      const content = buildNotification(event);
      const preferences = await this.notifications.getPreferences(
        event.recipientId,
      );
      if (!preferences.enabled) return;
      if (!preferences[content.category]) return;

      const subscriptions = await this.notifications.listSubscriptions(
        event.recipientId,
      );
      const payload = {
        title: content.title,
        body: content.body,
        url: content.url,
        tag: content.tag,
      };

      for (const subscription of subscriptions) {
        const failure = await this.sender.send(subscription, payload);
        if (failure === 'gone') {
          await this.notifications.deleteSubscription(subscription.endpoint);
        }
      }
    } catch (error) {
      this.logger.error(
        `Не удалось доставить уведомление ${event.name}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
