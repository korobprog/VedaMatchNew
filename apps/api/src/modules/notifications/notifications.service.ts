import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  NotificationCategory,
  NotificationInboxResponse,
  NotificationItemDto,
  NotificationMark,
  NotificationPreferencesDto,
  NotificationDeviceStats,
  NotificationDeliveryStatusDto,
  NotificationReadStateResponse,
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
import { workTaskUrl } from './notification-copy';
import {
  isUniqueViolation,
  liftRecipients,
  threadLiftData,
  threadRefreshData,
  workStatusThreadKey,
} from './inbox-thread';
import { parseNotificationMark } from './notification-mark';
import type { PushFailure } from './push-errors';
import { TELEGRAM_DEVICE_PROVIDER } from './telegram-device';

const defaults: NotificationPreferencesDto = {
  enabled: true,
  chat: true,
  calls: true,
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
  /**
   * Ветка новости (VED-320): есть — новость обновляет и поднимает уже лежащую
   * у человека строку с тем же ключом, а не кладёт вторую. См. `inbox-thread.ts`.
   */
  threadKey?: string | null;
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
      calls: row.calls,
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
      calls: patch.calls ?? current.calls,
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

  async addToInbox(
    userId: string,
    draft: InboxDraft,
    now = new Date(),
  ): Promise<void> {
    const { threadKey, ...news } = draft;
    if (!threadKey) {
      await this.prisma.notificationItem.create({
        data: { userId, ...news },
      });
      return;
    }

    // Ветка (VED-320): строка на человека и ключ одна. Есть — переписываем и
    // поднимаем, нет — заводим. Upsert по уникальной паре, а не «найти, потом
    // решить»: между чтением и записью могла вклиниться вторая доставка.
    const where = { userId_threadKey: { userId, threadKey } };
    const refresh = threadRefreshData(
      {
        title: news.title,
        body: news.body,
        url: news.url,
        category: news.category,
        mark: news.mark ?? null,
      },
      now,
    );
    try {
      await this.prisma.notificationItem.upsert({
        where,
        create: { userId, threadKey, ...news, createdAt: now },
        update: refresh,
      });
    } catch (error) {
      // Проиграли гонку вставки — строка уже есть, остаётся её обновить.
      if (!isUniqueViolation(error)) throw error;
      await this.prisma.notificationItem.update({ where, data: refresh });
    }
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
   * Обновляет пометку состояния у всех уведомлений об одной задаче (VED-320).
   *
   * Зачем: пометка была снимком колонки на момент события, и уехавшая дальше
   * карточка оставляла в ленте прошлый ответ — «в уведомлениях Тестирование, а
   * при раскрытии задачи На доработку. Такого быть не должно». Теперь «Работа»
   * на каждой смене колонки шлёт `work.task.mark-refreshed`, и пометка
   * догоняет карточку у всех получателей сразу, включая прочитанные
   * уведомления: человек смотрит в ленту, чтобы понять, что с задачей сейчас.
   *
   * Ищем по адресу, а не по задаче: своей ссылки на `WorkTask` у уведомления
   * нет и быть не может — FK на модель чужого сервиса контракт запрещает, — а
   * адрес карточки уведомление и так хранит, и собирает его тот же
   * `workTaskUrl`, что и при доставке. Категория в условии — страховка от
   * случайного совпадения адреса с уведомлением не про «Работу».
   *
   * Заголовок и текст не трогаем: это новость на свою дату, и переписывать
   * «вернули в „Тестерование“» задним числом значило бы стирать историю.
   * Меняется ровно ответ на вопрос «где карточка сейчас».
   */
  async refreshWorkTaskMark(
    spaceId: string,
    taskKey: string,
    mark: NotificationMark | null,
    liftRecipientIds: readonly string[] = [],
    now = new Date(),
  ): Promise<number> {
    const url = workTaskUrl(spaceId, taskKey);
    const { count } = await this.prisma.notificationItem.updateMany({
      where: { url, category: 'work' },
      data: { mark },
    });

    // Подъём строки о смене статуса (VED-320): «задача поднимается вверх по
    // ленте для всех остальных админов, но не для него». Кому — сказала
    // «Работа», актора в списке нет. Сразу, а не через окно дозревания, по
    // той же причине, что и пометка: значок уже сменился, и строка, оставшаяся
    // внизу с новым значком, читалась бы как «изменилось, но не для вас».
    //
    // Поднимается только ветка статуса — у кого её ещё нет, тому через окно
    // придёт новая новость и ляжет наверх сама. Комментарии и поручения не
    // трогаем: их порядок — порядок разговора.
    const recipients = liftRecipients(liftRecipientIds);
    if (recipients.length > 0) {
      await this.prisma.notificationItem.updateMany({
        where: {
          userId: { in: recipients },
          threadKey: workStatusThreadKey(url),
        },
        data: threadLiftData(now),
      });
    }
    return count;
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

  /**
   * Своя отметка у одного уведомления (VED-143), в обе стороны.
   *
   * Зачем отдельный маршрут, когда есть `markRead(userId, [id])`: тот умеет
   * только в одну сторону и ничего не возвращает. Кнопка на карточке обязана
   * откатываться — промах по соседней карточке на телефоне обычнее попадания,
   * — и обязана сразу гасить значок на колокольчике, а для этого ей нужен
   * счётчик в том же ответе.
   *
   * Чужое уведомление не найдётся: `userId` стоит в условии выборки, а не
   * проверяется после неё, поэтому по чужому `id` приходит 404, а не 403 —
   * отличать «нет такого» от «есть, но не ваше» посторонний не должен.
   *
   * `readAt` у уже прочитанного не переставляется: повторное нажатие на ту же
   * сторону — не событие. На порядок ленты это не влияет (VED-153 сортирует по
   * `createdAt`), но дата прочтения — это ответ на вопрос «когда я это
   * видел», и обновлять её задним числом незачем.
   */
  async setReadState(
    userId: string,
    id: string,
    read: boolean,
  ): Promise<NotificationReadStateResponse> {
    const current = await this.prisma.notificationItem.findFirst({
      where: { id, userId },
      select: { id: true, readAt: true },
    });
    if (!current) throw new NotFoundException('Уведомление не найдено');

    const readAt = read ? (current.readAt ?? new Date()) : null;
    if (readAt?.getTime() !== current.readAt?.getTime()) {
      await this.prisma.notificationItem.update({
        where: { id: current.id },
        data: { readAt },
      });
    }

    return {
      id: current.id,
      readAt: readAt?.toISOString() ?? null,
      // Счётчик перечитывается, а не считается арифметикой от прежнего: между
      // открытием страницы и нажатием кнопки уведомления приходят и гаснут в
      // других вкладках, и «минус один» разошёлся бы с колокольчиком.
      unreadCount: await this.countUnread(userId),
    };
  }
}
