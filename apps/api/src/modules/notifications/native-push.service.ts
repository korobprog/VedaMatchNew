import { Injectable } from '@nestjs/common';
import type { ChatCallEndedPushReason } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildCallEndedMessage,
  buildCallIncomingMessage,
  type CallIncomingPushData,
  type PushPayload,
} from './fcm';
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
    return this.deliver(devices, ({ token }) => this.fcm.send(token, payload));
  }

  /**
   * Входящий звонок: устройства с `nativeCalls` получают data-only пуш
   * (карточка вызова и рингтон — забота приложения), остальные — обычный
   * пуш с уведомлением, как раньше. Так у одного человека с телефоном без
   * нативных звонков и телефоном с ними звонок не звонит дважды.
   */
  async sendCallIncoming(
    recipientId: string,
    data: CallIncomingPushData,
    fallbackPayload: PushPayload,
  ): Promise<NativePushResult> {
    if (!this.fcm.configured) return { devices: 0, delivered: 0 };
    const devices = await this.prisma.notificationDevice.findMany({
      where: { userId: recipientId, provider: 'fcm' },
      select: { token: true, nativeCalls: true },
    });
    return this.deliver(devices, ({ token, nativeCalls }) =>
      nativeCalls
        ? this.fcm.sendRaw(buildCallIncomingMessage(token, data))
        : this.fcm.send(token, fallbackPayload),
    );
  }

  /**
   * «Звонок снят»: гасит рингтон на нативных устройствах человека, которые
   * не участвуют в разговоре. Устройствам без `nativeCalls` слать нечего —
   * рингтона от data-пуша у них не было, входящий они получили как обычное
   * уведомление, которое само не звонит.
   */
  async sendCallEnded(
    userId: string,
    callId: string,
    reason: ChatCallEndedPushReason,
  ): Promise<NativePushResult> {
    if (!this.fcm.configured) return { devices: 0, delivered: 0 };
    const devices = await this.prisma.notificationDevice.findMany({
      where: { userId, provider: 'fcm', nativeCalls: true },
      select: { token: true, nativeCalls: true },
    });
    return this.deliver(devices, ({ token }) =>
      this.fcm.sendRaw(buildCallEndedMessage(token, { callId, reason })),
    );
  }

  /** Общий обход телефонов пачками с удалением протухших токенов. */
  private async deliver<T extends { token: string }>(
    devices: T[],
    send: (device: T) => Promise<string | null>,
  ): Promise<NativePushResult> {
    let delivered = 0;
    for (let i = 0; i < devices.length; i += NATIVE_PUSH_CONCURRENCY) {
      const chunk = devices.slice(i, i + NATIVE_PUSH_CONCURRENCY);
      const results = await Promise.all(
        chunk.map(async (device) => {
          const failure = await send(device);
          if (failure === 'gone') {
            await this.prisma.notificationDevice.deleteMany({
              where: { token: device.token },
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
