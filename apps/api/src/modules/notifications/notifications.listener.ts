import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { NotificationEvent } from '@vedamatch/shared';
import { buildNotification, notificationEventNames } from './notification-copy';
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

  @OnEvent(notificationEventNames.astroTransitDigestReady)
  onAstroTransitDigestReady(event: NotificationEvent): void {
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
      // Молчание — самый частый повод для жалобы «уведомление не пришло», и
      // раньше его причину из логов было не достать: доставка ничего не писала.
      if (!preferences.enabled || !preferences[content.category]) {
        this.logger.log(
          `${event.name} для ${event.recipientId} пропущено: категория ${content.category} выключена`,
        );
        return;
      }

      const subscriptions = await this.notifications.listSubscriptions(
        event.recipientId,
      );
      if (subscriptions.length === 0) {
        this.logger.log(
          `${event.name} для ${event.recipientId} пропущено: нет подписок`,
        );
        return;
      }
      const payload = {
        title: content.title,
        body: content.body,
        url: content.url,
        tag: content.tag,
      };

      let delivered = 0;
      for (const subscription of subscriptions) {
        const failure = await this.sender.send(subscription, payload);
        if (failure === null) delivered += 1;
        if (failure === 'gone') {
          await this.notifications.deleteSubscription(subscription.endpoint);
        }
      }
      this.logger.log(
        `${event.name} для ${event.recipientId}: доставлено ${delivered} из ${subscriptions.length}`,
      );
    } catch (error) {
      this.logger.error(
        `Не удалось доставить уведомление ${event.name}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
