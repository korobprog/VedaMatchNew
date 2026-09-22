import { Injectable } from '@nestjs/common';
import type { ChatCallEndedPushReason } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ANDROID_CALLS_CHANNEL_ID } from './android-channel';
import {
  buildCallEndedMessage,
  buildCallIncomingMessage,
  type CallIncomingPushData,
  type PushPayload,
} from './fcm';
import { FcmSenderService } from './fcm-sender.service';
import type { PushFailure } from './push-errors';
import {
  deliveryHealthSelect,
  NotificationsService,
  type StoredDevice,
} from './notifications.service';

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
    private readonly notifications: NotificationsService,
  ) {}

  async sendToUsers(
    userIds: string[],
    payload: PushPayload,
    /**
     * Категория уведомлений Android (VED-361). По умолчанию «Сообщения»: так
     * идут переписка, заявки и новости. Звонковые события передают канал
     * `calls`, иначе выключенные в системе «Сообщения» гасят и вызов.
     */
    channelId?: string,
  ): Promise<NativePushResult> {
    if (userIds.length === 0 || !this.fcm.configured) {
      return { devices: 0, delivered: 0 };
    }
    const devices = await this.prisma.notificationDevice.findMany({
      where: { userId: { in: userIds }, provider: 'fcm' },
      select: { token: true, ...deliveryHealthSelect },
    });
    return this.deliver(devices, ({ token }) =>
      this.fcm.send(token, payload, channelId),
    );
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
    // Фолбэк для телефонов без нативного экрана вызова идёт каналом «Звонки»
    // (VED-361): это звонок, и прятаться вместе с перепиской он не должен.
    if (!this.fcm.configured) return { devices: 0, delivered: 0 };
    const devices = await this.prisma.notificationDevice.findMany({
      where: { userId: recipientId, provider: 'fcm' },
      select: { token: true, nativeCalls: true, ...deliveryHealthSelect },
    });
    return this.deliver(devices, ({ token, nativeCalls }) =>
      nativeCalls
        ? this.fcm.sendRaw(buildCallIncomingMessage(token, data))
        : this.fcm.send(token, fallbackPayload, ANDROID_CALLS_CHANNEL_ID),
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
      select: { token: true, nativeCalls: true, ...deliveryHealthSelect },
    });
    return this.deliver(devices, ({ token }) =>
      this.fcm.sendRaw(buildCallEndedMessage(token, { callId, reason })),
    );
  }

  /**
   * Общий обход телефонов пачками. Исход каждой попытки идёт в базу
   * (VED-314): успех отмечает приём, отказ — в счётчик неудач, протухший
   * токен удаляется. Раньше след оставлял только ответ `gone`, и телефон,
   * которому пуши просто не уходят, было не отличить от живого.
   */
  private async deliver<T extends StoredDevice>(
    devices: T[],
    send: (device: T) => Promise<PushFailure | null>,
  ): Promise<NativePushResult> {
    let delivered = 0;
    for (let i = 0; i < devices.length; i += NATIVE_PUSH_CONCURRENCY) {
      const chunk = devices.slice(i, i + NATIVE_PUSH_CONCURRENCY);
      const results = await Promise.all(
        chunk.map(async (device) => {
          const failure = await send(device);
          await this.notifications.recordDeviceResult(device, failure);
          return failure === null;
        }),
      );
      delivered += results.filter(Boolean).length;
    }
    return { devices: devices.length, delivered };
  }
}
