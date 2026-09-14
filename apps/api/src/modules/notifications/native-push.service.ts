import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { PushPayload } from './fcm';
import { FcmSenderService } from './fcm-sender.service';

/** Сколько телефонов опрашивать одновременно: как у веб-пушей в рассылке. */
const NATIVE_PUSH_CONCURRENCY = 10;

export interface NativePushResult {
  devices: number;
  delivered: number;
}

/**
 * Пуши в приложение VedaMatch всем телефонам перечисленных людей. Мёртвые
 * токены удаляются по ответу службы доставки.
 *
 * Сейчас отправляет только через FCM. Телефоны RuStore регистрируются заранее,
 * но ждут своего отправителя и в счёт не идут.
 */
@Injectable()
export class NativePushService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fcm: FcmSenderService,
  ) {}

  async sendToUsers(
    userIds: string[],
    payload: PushPayload,
  ): Promise<NativePushResult> {
    if (userIds.length === 0 || !this.fcm.configured) {
      return { devices: 0, delivered: 0 };
    }
    const devices = await this.prisma.notificationDevice.findMany({
      where: { userId: { in: userIds }, provider: 'fcm' },
      select: { token: true },
    });

    let delivered = 0;
    for (let i = 0; i < devices.length; i += NATIVE_PUSH_CONCURRENCY) {
      const chunk = devices.slice(i, i + NATIVE_PUSH_CONCURRENCY);
      const results = await Promise.all(
        chunk.map(async ({ token }) => {
          const failure = await this.fcm.send(token, payload);
          if (failure === 'gone') {
            await this.prisma.notificationDevice.deleteMany({
              where: { token },
            });
          }
          return failure === null;
        }),
      );
      delivered += results.filter(Boolean).length;
    }
    return { devices: devices.length, delivered };
  }
}
