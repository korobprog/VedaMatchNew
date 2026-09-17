/**
 * Разбор data-пуша звонка (VED-221). Приходит из `@react-native-firebase/messaging`
 * (фоновый обработчик `index.js` и `onMessage` на переднем плане) — оба пути
 * скармливают сюда `remoteMessage.data`, а не разбирают его сами: одна точка
 * правды для формата, который шлёт сервер
 * (`apps/api/src/modules/notifications/fcm.ts`, `buildCallIncomingMessage`/
 * `buildCallEndedMessage`). Чистый модуль — ни Firebase, ни нативного модуля
 * звонков здесь нет, только строки в типы.
 */

export type IncomingCallKind = 'audio' | 'video';

export interface IncomingCallPush {
  type: 'call.incoming';
  callId: string;
  conversationId: string;
  kind: IncomingCallKind;
  callerName: string;
  /** Сервер не кладёт ключ вовсе, если аватара нет (см. `fcm.ts`). */
  callerAvatarUrl: string | null;
  /** ISO-момент, после которого дозвон считается пропущенным. */
  expiresAt: string;
}

export interface CallEndedPush {
  type: 'call.ended';
  callId: string;
  reason: string;
}

export type CallPush = IncomingCallPush | CallEndedPush;

/** `data` FCM-сообщения — все значения уже строки, как того требует HTTP v1. */
export type RawCallPushData = Record<string, unknown> | null | undefined;

function str(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * `null`, если это не звонок или пуш испорчен (не хватает обязательного
 * поля) — вызывающий код тогда просто ничего не делает, а не падает.
 */
export function parseCallPush(data: RawCallPushData): CallPush | null {
  if (!data || typeof data !== 'object') return null;
  const type = str(data, 'type');

  if (type === 'call.incoming') {
    const callId = str(data, 'callId');
    const conversationId = str(data, 'conversationId');
    const kindRaw = str(data, 'kind');
    const callerName = str(data, 'callerName');
    const expiresAt = str(data, 'expiresAt');
    if (!callId || !conversationId || !callerName || !expiresAt) return null;
    if (kindRaw !== 'audio' && kindRaw !== 'video') return null;
    return {
      type: 'call.incoming',
      callId,
      conversationId,
      kind: kindRaw,
      callerName,
      callerAvatarUrl: str(data, 'callerAvatarUrl'),
      expiresAt,
    };
  }

  if (type === 'call.ended') {
    const callId = str(data, 'callId');
    const reason = str(data, 'reason');
    if (!callId || !reason) return null;
    return { type: 'call.ended', callId, reason };
  }

  return null;
}

/**
 * Просрочен ли дозвон к моменту обработки: пуш мог долго лежать в очереди
 * FCM (сеть, Doze) и доехать позже `expiresAt`, которое сервер и так
 * ограничил TTL сообщения (`CALL_INCOMING_TTL_SECONDS`, `fcm.ts`) — но TTL
 * сообщения и время в его данных могут разойтись на секунды доставки.
 * Дату, которую не удалось разобрать, считаем просроченной: показать
 * звонок без понятного времени истечения — хуже, чем не показать вовсе.
 */
export function isIncomingCallExpired(push: IncomingCallPush, nowMs: number): boolean {
  const expiresAtMs = Date.parse(push.expiresAt);
  if (!Number.isFinite(expiresAtMs)) return true;
  return nowMs >= expiresAtMs;
}
