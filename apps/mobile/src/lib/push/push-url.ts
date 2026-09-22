/**
 * Куда вести человека по нажатию на пуш. Сервер кладёт в `data.url` путь
 * сайта: `/chat/<id>`, `/chat/<id>?call=<callId>`, `/chat/requests`,
 * `/market/orders/<id>`, `/notices/<id>`, `/vacancies/...`, `/notifications`
 * и так далее — весь список формулирует `notification-copy.ts` на сервере.
 *
 * До VED-330 разбор жил здесь и знал ровно одну форму — беседу; всё
 * остальное возвращало `home`, то есть список чатов. Пуш про заявку на
 * Рынке, отклик на объявление или задачу в «Работе» молча приземлялся в
 * чатах, и человек не узнавал, что произошло. Теперь таблица разбора одна
 * на пуш и на ленту уведомлений —
 * `lib/notifications/notification-target.ts`: два источника дают один и тот
 * же путь, и расходиться им не с чего.
 */

import {
  resolveNotificationTarget,
  type NotificationTarget,
} from '@/lib/notifications/notification-target';

/** Раздел из пуша. Тип общий с лентой — см. `notification-target.ts`. */
export type PushTarget = NotificationTarget;

/**
 * Раздел, на который показывает пуш. Тонкая обёртка: собственной таблицы
 * разбора у пушей больше нет.
 *
 * Оставлена отдельным именем, потому что её зовёт не только переход, но и
 * `setNotificationHandler` в `push-bridge.tsx`: он прячет баннер беседы,
 * уже открытой на экране, и ему нужен именно раздел, а не маршрут.
 */
export function pushTarget(url: unknown): PushTarget {
  return resolveNotificationTarget(url);
}

/**
 * Ссылка из уведомления, презентованного самим приложением
 * (`Notifications.scheduleNotificationAsync`, `push-bridge.tsx`) —
 * `content.data` содержит то, что мы сами туда положили. `trigger.remoteMessage`
 * — путь expo-notifications для пушей, принятых её собственным
 * `FirebaseMessagingService`; с VED-221 этот сервис вырезан из манифеста
 * (`plugins/with-native-calls.js`, `docs/mobile-calls-native.md` §4/§11),
 * приём FCM целиком у RNFB — ветка оставлена как безопасный второй путь на
 * случай будущих локальных уведомлений с этой формой `trigger`, но в
 * проде сейчас не срабатывает.
 */
export function pushUrlOf(notification: {
  request: { content: { data?: unknown }; trigger?: unknown };
}): string | null {
  const data = notification.request.content.data as Record<string, unknown> | undefined;
  if (typeof data?.url === 'string') return data.url;
  const trigger = notification.request.trigger as
    | { remoteMessage?: { data?: Record<string, unknown> } }
    | null
    | undefined;
  const remote = trigger?.remoteMessage?.data?.url;
  return typeof remote === 'string' ? remote : null;
}

/**
 * Та же ссылка, но из «сырого» FCM-сообщения RNFB (`RemoteMessage.data`) —
 * источник для пушей, которые показала сама система (приложение свёрнуто
 * или убито), а не мы через `expo-notifications`: `getInitialNotification`/
 * `onNotificationOpenedApp` (`@react-native-firebase/messaging`,
 * `push-bridge.tsx`). Отдельная функция, а не веточка внутри `pushUrlOf`:
 * форма данных другая (`RemoteMessage`, не `Notifications.Notification`),
 * общий у них только `pushTarget()` на результате.
 */
export function rnfbMessageUrlOf(message: { data?: Record<string, unknown> } | null | undefined): string | null {
  const url = message?.data?.url;
  return typeof url === 'string' ? url : null;
}
