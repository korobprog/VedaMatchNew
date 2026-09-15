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
 * Ссылка из уведомления. Когда приложение закрыто, Android показывает пуш
 * сам, и данные FCM лежат не в `content.data`, а в `trigger.remoteMessage`.
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
