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

  @OnEvent(notificationEventNames.portalChatMessageSent)
  onPortalChatMessage(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.portalChatRequestReceived)
  onPortalChatRequest(event: NotificationEvent): void {
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

  @OnEvent(notificationEventNames.astroCompatibilityRequested)
  onAstroCompatibilityRequested(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.astroCompatibilityAccepted)
  onAstroCompatibilityAccepted(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.noticePublished)
  onNoticePublished(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.noticeResponseReceived)
  onNoticeResponseReceived(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.noticeResponseAccepted)
  onNoticeResponseAccepted(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.contactsRequestReceived)
  onContactsRequestReceived(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.contactsRequestAccepted)
  onContactsRequestAccepted(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.announcementPublished)
  onAnnouncementPublished(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.profileEditedByAdmin)
  onProfileEditedByAdmin(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.supportReplied)
  onSupportReplied(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.supportReceived)
  onSupportReceived(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.astroTransitDigestReady)
  onAstroTransitDigestReady(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.marketChatMessageSent)
  onMarketChatMessageSent(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.marketOrderCreated)
  onMarketOrderCreated(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.marketOrderStatusChanged)
  onMarketOrderStatusChanged(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.marketListingPublished)
  onMarketListingPublished(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.marketListingPriceDropped)
  onMarketListingPriceDropped(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.motivationReelPublished)
  onMotivationReelPublished(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.motivationReelRejected)
  onMotivationReelRejected(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.motivationVideoReady)
  onMotivationVideoReady(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.motivationVideoReview)
  onMotivationVideoReview(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.marketReviewReceived)
  onMarketReviewReceived(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.librarySectionRequestDecided)
  onLibrarySectionRequestDecided(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.teamApplicationReceived)
  onTeamApplicationReceived(event: NotificationEvent): void {
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

      // Колокольчик наполняется до пуша и независимо от него: разрешение на
      // уведомления в браузере может быть не выдано, а список внутри портала
      // должен работать всё равно.
      await this.notifications.addToInbox(event.recipientId, {
        title: content.title,
        body: content.body,
        url: content.url,
        category: content.category,
      });

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
      // Вместе с именем — поля нагрузки: у безымянного события (издатель забыл
      // продублировать `name`) одно только `undefined` в логе не говорит даже
      // о том, какой сервис его прислал.
      this.logger.error(
        `Не удалось доставить уведомление ${event.name} (поля: ${Object.keys(
          event ?? {},
        ).join(', ')})`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
  @OnEvent(notificationEventNames.musicTrackPublished)
  onMusicTrackPublished(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.musicTrackRejected)
  onMusicTrackRejected(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.musicTrackHiddenByReports)
  onMusicTrackHidden(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.musicTrackReviewExpired)
  onMusicTrackReviewExpired(event: NotificationEvent): void {
    void this.deliver(event);
  }

}
