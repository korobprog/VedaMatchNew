import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { classifyPushError, type PushFailure } from './push-errors';
import type { StoredSubscription } from './notifications.service';
import {
  describePushFailure,
  pushServiceOf,
  webPushOptions,
} from './web-push-request';

@Injectable()
export class PushSenderService {
  private readonly logger = new Logger(PushSenderService.name);
  private readonly configured: boolean;

  constructor(config: ConfigService) {
    const publicKey = config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = config.get<string>('VAPID_PRIVATE_KEY');
    const subject = config.get<string>('VAPID_SUBJECT');
    this.configured = Boolean(publicKey && privateKey && subject);
    if (this.configured) {
      webpush.setVapidDetails(subject!, publicKey!, privateKey!);
    } else {
      // Локальная разработка без ключей — не повод падать при старте.
      this.logger.warn('VAPID-ключи не заданы: пуши отключены');
    }
  }

  /**
   * Заданы ли ключи VAPID. Читает доставка: когда ключей нет, пуш даже не
   * уходит, и отметки живости подписки (VED-314) такой «отказ» портить не
   * должен — виноват сервер, а не браузер человека.
   */
  get vapidConfigured(): boolean {
    return this.configured;
  }

  /** Никогда не бросает: вызывающий код работает в слушателе события,
   *  где необработанное отклонение уронило бы процесс. */
  async send(
    subscription: StoredSubscription,
    payload: { tag?: unknown },
  ): Promise<PushFailure | null> {
    if (!this.configured) return 'transient';
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify(payload),
        webPushOptions(payload),
      );
      return null;
    } catch (error) {
      const { statusCode, body } = error as {
        statusCode?: number;
        body?: unknown;
      };
      const failure = classifyPushError(statusCode);
      this.logger.warn(
        `Пуш не доставлен (${describePushFailure(
          pushServiceOf(subscription.endpoint),
          statusCode,
          body,
        )}): ${failure}`,
      );
      return failure;
    }
  }
}
