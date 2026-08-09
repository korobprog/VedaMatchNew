import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { classifyPushError, type PushFailure } from './push-errors';
import type { StoredSubscription } from './notifications.service';

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

  /** Никогда не бросает: вызывающий код работает в слушателе события,
   *  где необработанное отклонение уронило бы процесс. */
  async send(
    subscription: StoredSubscription,
    payload: object,
  ): Promise<PushFailure | null> {
    if (!this.configured) return 'transient';
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify(payload),
      );
      return null;
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      const failure = classifyPushError(statusCode);
      this.logger.warn(
        `Пуш не доставлен (${statusCode ?? 'без кода'}): ${failure}`,
      );
      return failure;
    }
  }
}
