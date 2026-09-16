/**
 * Куда вести человека по нажатию на пуш. Сервер кладёт в `data.url` путь сайта:
 * `/chat/<id>`, `/chat/<id>?call=<callId>`, `/chat/requests`, `/notifications`.
 * В приложении есть только экран беседы, остальное открывает вкладку чатов.
 */

export type PushTarget = { kind: 'chat'; conversationId: string } | { kind: 'home' };

const CHAT_PATH = /^\/chat\/([^/?#]+)/;
/** Служебные разделы сайта, похожие на беседу по форме пути. */
const NOT_CONVERSATIONS = new Set(['requests', 'with', 'people', 'appearance']);

export function pushTarget(url: unknown): PushTarget {
  if (typeof url !== 'string') return { kind: 'home' };
  const match = CHAT_PATH.exec(url);
  if (!match) return { kind: 'home' };
  const id = decodeURIComponent(match[1]);
  if (NOT_CONVERSATIONS.has(id)) return { kind: 'home' };
  return { kind: 'chat', conversationId: id };
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
