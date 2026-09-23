import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type {
  AuthTelegramConnectedEvent,
  AuthTelegramDisconnectedEvent,
  ChatCallEndedEvent,
  NotificationEvent,
  UserRegisteredEvent,
  WorkTaskMarkRefreshedEvent,
} from '@vedamatch/shared';
import {
  AUTH_TELEGRAM_CONNECTED_EVENT,
  AUTH_TELEGRAM_DISCONNECTED_EVENT,
  CHAT_CALL_ENDED_EVENT,
  USER_REGISTERED_EVENT,
  WORK_TASK_MARK_REFRESHED_EVENT,
  resolveDisplayName,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { androidChannelFor } from './android-channel';
import { decideDelivery, describeDeliverySkip } from './delivery-rule';
import { buildNotification, notificationEventNames } from './notification-copy';
import { NativePushService } from './native-push.service';
import { NotificationsService } from './notifications.service';
import { PushSenderService } from './push-sender.service';
import { buildTelegramNotificationText } from './telegram-copy';
import { TelegramNotificationsService } from './telegram-notifications.service';
import { TelegramSenderService } from './telegram-sender.service';

@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly sender: PushSenderService,
    private readonly prisma: PrismaService,
    private readonly nativePush: NativePushService,
    private readonly telegramNotifications: TelegramNotificationsService,
    private readonly telegramSender: TelegramSenderService,
  ) {}

  /**
   * Заведена или подтверждена связка с Telegram (вход через мини-приложение
   * или привязка живой сессией, см. `AuthService`). `UserIdentity` здесь не
   * читаем — событие самодостаточно, только заводит устройство доставки.
   */
  @OnEvent(AUTH_TELEGRAM_CONNECTED_EVENT)
  onTelegramConnected(event: AuthTelegramConnectedEvent): void {
    void this.telegramNotifications
      .setConnected(event.userId, event.telegramUserId, event.canWrite)
      .catch((error) =>
        this.logger.warn(
          `Устройство Telegram не заведено для ${event.userId}: ${String(error)}`,
        ),
      );
  }

  /** Telegram отвязан (`DELETE /auth/identities/telegram`) — боту больше
   *  некому писать, устройство гасится. */
  @OnEvent(AUTH_TELEGRAM_DISCONNECTED_EVENT)
  onTelegramDisconnected(event: AuthTelegramDisconnectedEvent): void {
    void this.telegramNotifications
      .disconnect(event.userId)
      .catch((error) =>
        this.logger.warn(
          `Устройство Telegram не отвязано для ${event.userId}: ${String(error)}`,
        ),
      );
  }

  /**
   * Приветствие новому участнику. Слушаем событие регистрации, а не ждём от
   * `auth` готового уведомления: модуль входа о приветствиях не знает и знать
   * не должен, он сообщает факт.
   *
   * Имя событие не несёт — берём его из `User`, одной из четырёх портальных
   * моделей, читать которые разрешено. Наружу идёт `resolveDisplayName`:
   * духовное имя, если оно есть, иначе мирское.
   */
  @OnEvent(USER_REGISTERED_EVENT)
  onUserRegistered(event: UserRegisteredEvent): void {
    void this.welcome(event.userId);
  }

  private async welcome(userId: string): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, spiritualName: true },
      });
      if (!user) return;
      await this.deliver({
        name: 'portal.welcome',
        recipientId: userId,
        recipientName: resolveDisplayName(user),
      });
    } catch (cause) {
      // Приветствие не повод ронять регистрацию: человек уже зарегистрирован,
      // и молчащий колокольчик хуже, чем упавший запрос на входе.
      this.logger.warn(`Приветствие не отправилось: ${String(cause)}`);
    }
  }

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

  @OnEvent(notificationEventNames.portalChatCallIncoming)
  onPortalChatCallIncoming(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.portalChatCallMissed)
  onPortalChatCallMissed(event: NotificationEvent): void {
    void this.deliver(event);
  }

  /**
   * Групповой звонок в беседе. Идёт обычным конвейером — тем же, что и
   * сообщение: в `deliver()` нет ветки на это имя, значит нативные
   * устройства получат обычный пуш через `sendToUsers`, а не data-only
   * вызов. Это не упущение, а условие задачи: нативный экран вызова
   * поднимает только `chat.call-incoming`, и поднимать его на комнату
   * нельзя (см. докстрингу события в `@vedamatch/shared`).
   */
  @OnEvent(notificationEventNames.portalChatGroupCallStarted)
  onPortalChatGroupCallStarted(event: NotificationEvent): void {
    void this.deliver(event);
  }

  /**
   * «Звонок снят» — вне обычного конвейера уведомлений: нет строки в
   * колокольчике, нет веб-пуша, только data-пуш нативным устройствам,
   * гасящий рингтон. См. `CHAT_CALL_ENDED_EVENT` в `@vedamatch/shared`.
   */
  @OnEvent(CHAT_CALL_ENDED_EVENT)
  onChatCallEnded(event: ChatCallEndedEvent): void {
    void this.nativePush
      .sendCallEnded(event.recipientId, event.callId, event.reason)
      .catch((error) =>
        this.logger.warn(
          `«Звонок снят» не доставлен (${event.callId}): ${String(error)}`,
        ),
      );
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
      // Правило «слать или нет» живёт в `delivery-rule.ts` со своим тестом
      // (VED-361): со звонками цена ошибки в этой строке выросла — категории
      // «Сообщения» и «Звонки» обязаны выключаться независимо друг от друга.
      const decision = decideDelivery(preferences, content.category);
      if (!decision.deliver) {
        this.logger.log(
          `${event.name} для ${event.recipientId} пропущено: ${describeDeliverySkip(
            decision.reason,
            content.category,
          )}`,
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
        // Значок состояния (VED-272) живёт только в ленте: в пуш он не едет —
        // там одна строка текста, и места под пометку у шторки нет.
        mark: content.mark ?? null,
        // Ветка (VED-320): повторная смена статуса задачи обновляет и
        // поднимает уже лежащую строку, а не кладёт рядом вторую.
        ...(content.threadKey ? { threadKey: content.threadKey } : {}),
      });

      const payload = {
        title: content.title,
        body: content.body,
        url: content.url,
        tag: content.tag,
      };
      // Телефоны с приложением получают тот же пуш, что и браузеры — кроме
      // входящего звонка: устройствам с `nativeCalls` он идёт data-only
      // (свой экран вызова и рингтон), остальным — как обычное уведомление.
      const native =
        event.name === 'chat.call-incoming'
          ? await this.nativePush.sendCallIncoming(
              event.recipientId,
              {
                callId: event.callId,
                conversationId: event.conversationId,
                kind: event.callKind,
                callerName: event.callerName,
                callerAvatarUrl: event.callerAvatarUrl,
                expiresAt: event.expiresAt,
              },
              payload,
            )
          : await this.nativePush.sendToUsers(
              [event.recipientId],
              payload,
              // Категория уведомлений Android по категории портала
              // (VED-361): звонок — в канал «Звонки», остальное — в
              // «Сообщения».
              androidChannelFor(content.category),
            );

      const subscriptions = await this.notifications.listSubscriptions(
        event.recipientId,
      );
      // Тумблер `telegram` — канал доставки, а не категория: категория уже
      // проверена выше и решает про колокольчик, браузер и телефон разом,
      // а этот тумблер выключает только бота, не трогая остальное.
      const telegramDevices = preferences.telegram
        ? await this.telegramNotifications.listDevices(event.recipientId)
        : [];
      if (
        subscriptions.length === 0 &&
        native.devices === 0 &&
        telegramDevices.length === 0
      ) {
        this.logger.log(
          `${event.name} для ${event.recipientId} пропущено: нет подписок`,
        );
        return;
      }

      let delivered = native.delivered;
      for (const subscription of subscriptions) {
        const failure = await this.sender.send(subscription, payload);
        // Итог попытки — в базу (VED-314): успех отмечает приём, отказ идёт в
        // счётчик, а протухшую подписку `recordPushResult` удаляет сам. Без
        // ключей VAPID попытки не было — записывать подписке нечего.
        if (this.sender.vapidConfigured) {
          await this.notifications.recordPushResult(subscription, failure);
        }
        if (failure === null) delivered += 1;
      }

      if (telegramDevices.length > 0) {
        const text = buildTelegramNotificationText(content, event);
        for (const device of telegramDevices) {
          const failure = await this.telegramSender.sendMessage({
            chatId: device.token,
            title: text.title,
            body: text.body,
            notificationUrl: content.url,
          });
          await this.notifications.recordDeviceResult(device, failure);
          if (failure === null) delivered += 1;
        }
      }

      // «Принято», а не «доставлено» (VED-314): служба доставки браузера и FCM
      // принимают пуш и для браузера, который не открывали месяц. Прежняя
      // формулировка «доставлено 6 из 6» соседствовала с жалобой «не приходят
      // пуши» — и читавший лог считал, что всё в порядке.
      this.logger.log(
        `${event.name} для ${event.recipientId}: службы доставки приняли ${delivered} из ${
          subscriptions.length + native.devices + telegramDevices.length
        }`,
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

  @OnEvent(notificationEventNames.workTaskAssigned)
  onWorkTaskAssigned(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.workTaskCommented)
  onWorkTaskCommented(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.workTaskReturned)
  onWorkTaskReturned(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.workTaskStatusChanged)
  onWorkTaskStatusChanged(event: NotificationEvent): void {
    void this.deliver(event);
  }

  /**
   * Карточка переехала — пометка состояния у уже лежащих уведомлений об этой
   * задаче догоняет её, а строка о смене статуса поднимается у всех, кого
   * назвала «Работа», — то есть у всех, кроме двигавшего (VED-320).
   *
   * Не новость, а поправка: ничего не создаётся и никуда не отправляется,
   * поэтому мимо `deliver()`. Осечка тут не должна валить перенос карточки на
   * доске — у «Работы» это синхронный вызов в обработчике запроса, — поэтому
   * только запись в лог.
   */
  @OnEvent(WORK_TASK_MARK_REFRESHED_EVENT)
  onWorkTaskMarkRefreshed(event: WorkTaskMarkRefreshedEvent): void {
    void this.notifications
      .refreshWorkTaskMark(
        event.spaceId,
        event.taskKey,
        event.statusMark,
        // Страховка от издателя старой сборки, где поля ещё не было.
        event.liftRecipientIds ?? [],
      )
      .catch((error) =>
        this.logger.warn(
          `Пометка состояния ${event.taskKey} не обновлена: ${String(error)}`,
        ),
      );
  }

  @OnEvent(notificationEventNames.workInviteReceived)
  onWorkInviteReceived(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.vacancyResponseCreated)
  onVacancyResponseCreated(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.vacancyResponseStatusChanged)
  onVacancyResponseStatusChanged(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.vacancyOfferClosed)
  onVacancyOfferClosed(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.travelBookingCreated)
  onTravelBookingCreated(event: NotificationEvent): void {
    void this.deliver(event);
  }

  @OnEvent(notificationEventNames.travelBookingStatusChanged)
  onTravelBookingStatusChanged(event: NotificationEvent): void {
    void this.deliver(event);
  }
}
