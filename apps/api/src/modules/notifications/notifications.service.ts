import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  NotificationCategory,
  NotificationInboxResponse,
  NotificationItemDto,
  NotificationMark,
  NotificationPreferencesDto,
  NotificationDeviceStats,
  NotificationDeliveryStatusDto,
  PushSubscriptionRequest,
  UpdateNotificationPreferencesRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  judgeDeliveryPoint,
  type DeliveryPointHealth,
} from './delivery-health';
import { normalizeDeviceRequest } from './device-request';
import { sortInboxRows } from './inbox-order';
import {
  buildInboxWhere,
  clampInboxLimit,
  inboxFetchSize,
  inboxSections,
  isPaginationRequested,
  INBOX_ORDER_BY,
  LEGACY_INBOX_LIMIT,
  parseInboxCursor,
  sliceInboxPage,
} from './inbox-page';
import { buildInboxSearchClauses, parseInboxSearch } from './inbox-search';
import { parseNotificationMark } from './notification-mark';
import type { PushFailure } from './push-errors';
import { TELEGRAM_DEVICE_PROVIDER } from './telegram-device';

const defaults: NotificationPreferencesDto = {
  enabled: true,
  chat: true,
  connections: true,
  support: true,
  transits: true,
  market: true,
  notices: true,
  motivation: true,
  music: true,
  work: true,
  travel: true,
  announcements: true,
  telegram: true,
};

/**
 * Сроки хранения переехали в `inbox-retention.ts`, а сама чистка — в
 * `NotificationPurgeWorkerService` (VED-267): на чтении ленты ей делать
 * нечего, человек ждал удалений вместо своего списка.
 */

/** Колонки, из которых собирается карточка ленты. */
interface InboxSelectedRow {
  id: string;
  title: string;
  body: string;
  url: string;
  category: string;
  createdAt: Date;
  readAt: Date | null;
  mark: string | null;
}

/** Чего просит клиент у ленты: порцию с такого-то места и, может быть, поиск. */
export interface ListInboxOptions {
  /** Курсор предыдущей порции; пусто — первая. */
  cursor?: unknown;
  /** Размер порции; пусто — `INBOX_PAGE_SIZE`. */
  limit?: unknown;
  /** Поисковый запрос; пусто — обычная лента. */
  query?: unknown;
}

export interface InboxDraft {
  title: string;
  body: string;
  url: string;
  category: NotificationCategory;
  /** Значок состояния (VED-272); `null`/пусто — уведомление без значка. */
  mark?: NotificationMark | null;
}

export interface StoredSubscription extends DeliveryPointHealth {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Телефон или бот вместе с отметками живости: отправитель возвращает исход,
 *  а записывает его `recordDeviceResult`. */
export interface StoredDevice extends DeliveryPointHealth {
  token: string;
}

/** Колонки живости, которые тянет любая выборка точек доставки. */
export const deliveryHealthSelect = {
  createdAt: true,
  lastSuccessAt: true,
  failureCount: true,
  lastSeenAt: true,
  deadSince: true,
} as const;

/**
 * Клиент подтвердил точку доставки — браузер пересохранил подписку при
 * загрузке страницы, приложение прислало токен при запуске. Это сигнал жизни
 * не от посредника, а от самого устройства: пометка «мёртвая» снимается,
 * счётчик неудач обнуляется.
 */
const seenByClient = () => ({
  lastSeenAt: new Date(),
  failureCount: 0,
  deadSince: null,
});

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Один endpoint — одно устройство. Если на нём сменился аккаунт,
   *  подписка переезжает к текущему пользователю, а не дублируется. */
  async saveSubscription(
    userId: string,
    dto: PushSubscriptionRequest,
    userAgent?: string,
  ): Promise<void> {
    const data = {
      userId,
      endpoint: dto.endpoint,
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
      userAgent: userAgent ?? null,
      // Сам факт этого запроса — свидетельство жизни браузера: страница
      // портала пересохраняет подписку при каждой загрузке (VED-314).
      ...seenByClient(),
    };
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: data,
      update: data,
    });
  }

  /**
   * Пользовательская отписка: удаляем только собственную подписку —
   * иначе, зная чужой endpoint, можно было бы отключить чужие пуши.
   */
  async deleteOwnSubscription(userId: string, endpoint: string): Promise<void> {
    if (typeof endpoint !== 'string' || endpoint.length === 0) {
      throw new BadRequestException('endpoint обязателен');
    }
    await this.prisma.pushSubscription.deleteMany({
      where: { endpoint, userId },
    });
  }

  /** Служебная чистка протухших endpoint'ов после 404/410 от push-сервиса. */
  async deleteSubscription(endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint } });
  }

  /**
   * Телефон с приложением. Токен выдаёт служба доставки, поэтому ключ — он:
   * если на телефоне сменили аккаунт, телефон переезжает к новому человеку.
   */
  async saveDevice(userId: string, body: unknown): Promise<void> {
    const device = normalizeDeviceRequest(body);
    // Регистрация токена — тот же сигнал жизни, что пересохранение подписки
    // браузером: приложение запустилось и умеет принимать пуши.
    const data = { userId, ...device, ...seenByClient() };
    await this.prisma.notificationDevice.upsert({
      where: { token: device.token },
      create: data,
      update: data,
    });
  }

  /** Выход из приложения: удаляем только свой телефон, как и веб-подписку. */
  async deleteOwnDevice(userId: string, token: unknown): Promise<void> {
    if (typeof token !== 'string' || token.length === 0) {
      throw new BadRequestException('Токен устройства обязателен');
    }
    await this.prisma.notificationDevice.deleteMany({
      where: { token, userId },
    });
  }

  async deviceStats(fcmConfigured: boolean): Promise<NotificationDeviceStats> {
    const [groups, users] = await Promise.all([
      this.prisma.notificationDevice.groupBy({
        by: ['provider'],
        _count: { _all: true },
      }),
      this.prisma.notificationDevice.findMany({
        distinct: ['userId'],
        select: { userId: true },
      }),
    ]);
    const byProvider: NotificationDeviceStats['byProvider'] = {
      fcm: 0,
      rustore: 0,
    };
    for (const group of groups) {
      if (group.provider === 'fcm' || group.provider === 'rustore')
        byProvider[group.provider] = group._count._all;
    }
    return {
      total: byProvider.fcm + byProvider.rustore,
      users: users.length,
      byProvider,
      fcmConfigured,
    };
  }

  async listSubscriptions(userId: string): Promise<StoredSubscription[]> {
    return this.prisma.pushSubscription.findMany({
      where: { userId },
      select: {
        id: true,
        endpoint: true,
        p256dh: true,
        auth: true,
        ...deliveryHealthSelect,
      },
    });
  }

  /**
   * Итог попытки отправки в браузер (VED-314). Раньше строка удалялась только
   * по ответу `gone`, а всё остальное копилось годами: про отказы и про успехи
   * не оставалось никакого следа.
   *
   * - успех — отметка приёма и обнуление счётчика (пометка «мёртвая» снимается);
   * - `gone` — строку удаляет служба доставки, спорить не о чем;
   * - прочее — неудача в счётчик, и только потом правило
   *   `judgeDeliveryPoint()` решает: оставить, пометить или удалить.
   */
  async recordPushResult(
    subscription: StoredSubscription,
    failure: PushFailure | null,
  ): Promise<void> {
    if (failure === 'gone') {
      await this.deleteSubscription(subscription.endpoint);
      return;
    }
    const now = new Date();
    if (failure === null) {
      await this.prisma.pushSubscription.updateMany({
        where: { endpoint: subscription.endpoint },
        data: { lastSuccessAt: now, failureCount: 0, deadSince: null },
      });
      return;
    }
    const failureCount = subscription.failureCount + 1;
    const verdict = judgeDeliveryPoint({ ...subscription, failureCount }, now);
    if (verdict === 'delete') {
      await this.deleteSubscription(subscription.endpoint);
      return;
    }
    await this.prisma.pushSubscription.updateMany({
      where: { endpoint: subscription.endpoint },
      data: {
        failureCount,
        lastFailureAt: now,
        ...(verdict === 'mark' ? { deadSince: now } : {}),
      },
    });
  }

  /**
   * То же для телефона с приложением и для устройства бота. Отдельный метод, а
   * не общий с веб-подпиской: таблицы разные, а ключ у устройства — токен.
   */
  async recordDeviceResult(
    device: StoredDevice,
    // `permanent` шлёт только Bot API: повторять и удалять устройство не за
    // что, но в счётчик неудач такой отказ идёт наравне с остальными.
    failure: PushFailure | 'permanent' | null,
  ): Promise<void> {
    if (failure === 'gone') {
      await this.prisma.notificationDevice.deleteMany({
        where: { token: device.token },
      });
      return;
    }
    const now = new Date();
    if (failure === null) {
      await this.prisma.notificationDevice.updateMany({
        where: { token: device.token },
        data: { lastSuccessAt: now, failureCount: 0, deadSince: null },
      });
      return;
    }
    const failureCount = device.failureCount + 1;
    const verdict = judgeDeliveryPoint({ ...device, failureCount }, now);
    if (verdict === 'delete') {
      await this.prisma.notificationDevice.deleteMany({
        where: { token: device.token },
      });
      return;
    }
    await this.prisma.notificationDevice.updateMany({
      where: { token: device.token },
      data: {
        failureCount,
        lastFailureAt: now,
        ...(verdict === 'mark' ? { deadSince: now } : {}),
      },
    });
  }

  /**
   * Есть ли человеку куда доставлять (VED-314). Нужно самому человеку в
   * настройках: раньше он жал «включить» и оставался в уверенности, что всё
   * работает, даже когда ни одной точки доставки у него не было — ровно это и
   * случилось с жалобой 21.09.
   *
   * Помеченные мёртвыми в живые не идут: доставки от них не ждём, а человеку
   * важно знать правду до того, как он пропустит звонок.
   */
  async deliveryStatus(userId: string): Promise<NotificationDeliveryStatusDto> {
    const [web, devices, stale] = await Promise.all([
      this.prisma.pushSubscription.count({
        where: { userId, deadSince: null },
      }),
      this.prisma.notificationDevice.groupBy({
        by: ['provider'],
        where: { userId, deadSince: null },
        _count: { _all: true },
      }),
      this.prisma.pushSubscription.count({
        where: { userId, deadSince: { not: null } },
      }),
    ]);
    let app = 0;
    let telegram = 0;
    for (const group of devices) {
      if (group.provider === TELEGRAM_DEVICE_PROVIDER)
        telegram += group._count._all;
      else app += group._count._all;
    }
    return {
      web,
      app,
      telegram,
      stale,
      reachable: web + app + telegram > 0,
    };
  }

  async getPreferences(userId: string): Promise<NotificationPreferencesDto> {
    const row = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });
    if (!row) return { ...defaults };
    return {
      enabled: row.enabled,
      chat: row.chat,
      connections: row.connections,
      support: row.support,
      transits: row.transits,
      market: row.market,
      notices: row.notices,
      motivation: row.motivation,
      music: row.music,
      work: row.work,
      travel: row.travel,
      announcements: row.announcements,
      telegram: row.telegram,
    };
  }

  async updatePreferences(
    userId: string,
    patch: UpdateNotificationPreferencesRequest,
  ): Promise<NotificationPreferencesDto> {
    const current = await this.getPreferences(userId);
    const next: NotificationPreferencesDto = {
      enabled: patch.enabled ?? current.enabled,
      chat: patch.chat ?? current.chat,
      connections: patch.connections ?? current.connections,
      support: patch.support ?? current.support,
      transits: patch.transits ?? current.transits,
      market: patch.market ?? current.market,
      notices: patch.notices ?? current.notices,
      motivation: patch.motivation ?? current.motivation,
      music: patch.music ?? current.music,
      work: patch.work ?? current.work,
      travel: patch.travel ?? current.travel,
      announcements: patch.announcements ?? current.announcements,
      telegram: patch.telegram ?? current.telegram,
    };
    await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...next },
      update: next,
    });
    return next;
  }

  // ===== Колокольчик =====

  async addToInbox(userId: string, draft: InboxDraft): Promise<void> {
    await this.prisma.notificationItem.create({
      data: { userId, ...draft },
    });
  }

  /**
   * Одинаковое уведомление многим за один запрос. Нужно рассылкам: класть его
   * по одному — двести INSERT'ов на пакет.
   */
  async addManyToInbox(userIds: string[], draft: InboxDraft): Promise<void> {
    if (userIds.length === 0) return;
    await this.prisma.notificationItem.createMany({
      data: userIds.map((userId) => ({ userId, ...draft })),
    });
  }

  async countUnread(userId: string): Promise<number> {
    return this.prisma.notificationItem.count({
      where: { userId, readAt: null },
    });
  }

  /**
   * Лента (VED-267): порцией или целиком — по тому, о чём попросил клиент.
   *
   * Было: чистка первой строкой, следом `findMany` без `take`. Человек ждал
   * удаления просроченного, чтобы получить свою ленту целиком — сколько бы её
   * ни накопилось, и вся она разом рисовалась на вебе. Чистку забрал
   * `NotificationPurgeWorkerService`.
   *
   * Развилка на входе: просят курсор или размер порции — отдаём страницу;
   * не просят — всю ленту, как раньше. Это не задел на будущее, а
   * совместимость с установленным приложением: оно про постраничность не
   * знает, придёт за лентой один раз и второй раз не придёт. Двадцать записей
   * вместо ста девяноста выглядели бы у него как пропавшие уведомления.
   *
   * Потолок стоит в обоих случаях. У ленты целиком он свой, большой
   * (`LEGACY_INBOX_LIMIT`), и если сработал — ответ честно говорит об этом
   * полем `truncated`, а не обрезает молча.
   *
   * Порядок VED-153 сохранён и выражен прямо в запросе: лента — два потока
   * подряд, непрочитанное и следом прочитанное, каждый по индексу
   * `[userId, createdAt]`. Порция набирается из первого потока, а когда он
   * кончился — добирается из второго; какая строка последняя и в каком она
   * потоке, помнит курсор (`inbox-page.ts`). `sortInboxRows()` остаётся: на
   * границе потоков в порцию попадают строки обоих.
   */
  async listInbox(
    userId: string,
    options: ListInboxOptions = {},
  ): Promise<NotificationInboxResponse> {
    const parsed = parseInboxCursor(options.cursor);
    if (parsed.kind === 'invalid')
      throw new BadRequestException('Некорректный курсор ленты');
    const cursor = parsed.kind === 'cursor' ? parsed.cursor : null;
    const paginated = isPaginationRequested(options.cursor, options.limit);
    const limit = paginated
      ? clampInboxLimit(options.limit)
      : LEGACY_INBOX_LIMIT;
    const searchClauses = buildInboxSearchClauses(
      parseInboxSearch(options.query),
    );

    const rows: InboxSelectedRow[] = [];
    let remaining = inboxFetchSize(limit);
    for (const section of inboxSections(cursor)) {
      if (remaining <= 0) break;
      const chunk = await this.prisma.notificationItem.findMany({
        where: buildInboxWhere({ userId, section, cursor, searchClauses }),
        orderBy: INBOX_ORDER_BY,
        take: remaining,
        select: {
          id: true,
          title: true,
          body: true,
          url: true,
          category: true,
          createdAt: true,
          readAt: true,
          mark: true,
        },
      });
      rows.push(...chunk);
      remaining -= chunk.length;
    }

    const page = sliceInboxPage(sortInboxRows(rows), limit);
    const items: NotificationItemDto[] = page.items.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      url: row.url,
      category: row.category as NotificationCategory,
      createdAt: row.createdAt.toISOString(),
      readAt: row.readAt?.toISOString() ?? null,
      // Через parse, а не as: в колонке строка, и запись, сделанная сборкой с
      // другим набором значков, не должна утекать клиенту неизвестным кодом.
      mark: parseNotificationMark(row.mark),
    }));
    return {
      items,
      // Клиенту, который постраничность не просил, курсор ни к чему: он за
      // ним не придёт. Но если лента упёрлась в потолок, об этом надо сказать
      // — и словом `truncated`, и курсором, чтобы продолжение было хотя бы
      // возможно.
      nextCursor: page.nextCursor,
      ...(!paginated && page.nextCursor !== null ? { truncated: true } : {}),
      // Счётчик — отдельным запросом по индексу `[userId, readAt]`, а не по
      // отданной порции: в порции их двадцать, а колокольчик обязан
      // показывать всё непрочитанное. От поиска он не зависит — это счётчик
      // человека, а не выдачи.
      unreadCount: await this.countUnread(userId),
    };
  }

  /**
   * Помечает прочитанным. Без `ids` — весь непрочитанный список: колокольчик
   * гасит счётчик целиком, когда человек открыл страницу.
   */
  async markRead(userId: string, ids?: string[]): Promise<void> {
    await this.prisma.notificationItem.updateMany({
      where: {
        userId,
        readAt: null,
        ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
      },
      data: { readAt: new Date() },
    });
  }
}
