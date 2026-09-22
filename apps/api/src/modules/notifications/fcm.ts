import { createSign } from 'node:crypto';
import { ANDROID_MESSAGES_CHANNEL_ID } from './android-channel';
import type { PushFailure } from './push-errors';

/**
 * Чистая часть отправки через FCM HTTP v1: разбор сервисного ключа, подпись
 * запроса токена у Google, сборка сообщения и разбор ошибок. Сеть и кэш
 * токена живут в `FcmSenderService`.
 *
 * Библиотеку firebase-admin не берём: из неё нужен один POST, а тянет она
 * десятки зависимостей.
 */

export const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
/**
 * Канал уведомлений Android по умолчанию — «Сообщения», его же создаёт
 * приложение. Звонки с VED-361 идут своим каналом: идентификаторы и правило
 * выбора живут в `android-channel.ts`, сюда канал приходит аргументом.
 */
export const ANDROID_CHANNEL_ID = ANDROID_MESSAGES_CHANNEL_ID;

/** Тип в `data` FCM-сообщения — им приложение различает пуши между собой. */
export const CALL_PUSH_TYPE_INCOMING = 'call.incoming';
export const CALL_PUSH_TYPE_ENDED = 'call.ended';

/**
 * Дозвон живёт `RING_TIMEOUT_MS` (`chat/calls/call-state.ts`) — те же 45 с
 * здесь, чтобы FCM не держал устаревший пуш дольше, чем сервер сам считает
 * звонок живым. Число, а не импорт: `chat/calls` не тянет `notifications` и
 * наоборот (контракт модулей), совпадение проверяет `fcm.spec.ts`.
 */
export const CALL_INCOMING_TTL_SECONDS = 45;
/** «Звонок снят» актуален секунды: устройство либо ловит его сразу, либо
 *  рингтон погаснет само по истечении TTL входящего пуша. */
export const CALL_ENDED_TTL_SECONDS = 30;

export interface ServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

/** Нагрузка пуша, та же, что у веб-пушей. */
export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/**
 * Ключ приходит JSON-ом или base64 от JSON: в переменной окружения панели
 * многострочный закрытый ключ легко испортить, а base64 — одна строка.
 */
export function parseServiceAccount(
  raw: string | undefined | null,
): ServiceAccount | null {
  const text = raw?.trim();
  if (!text) return null;
  const json = text.startsWith('{')
    ? text
    : Buffer.from(text, 'base64').toString('utf8');
  try {
    const data = JSON.parse(json) as Record<string, unknown>;
    const projectId = data.project_id;
    const clientEmail = data.client_email;
    const privateKey = data.private_key;
    if (
      typeof projectId !== 'string' ||
      typeof clientEmail !== 'string' ||
      typeof privateKey !== 'string'
    )
      return null;
    return { projectId, clientEmail, privateKey };
  } catch {
    return null;
  }
}

function base64url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

/** Подписанное утверждение сервисного аккаунта для обмена на токен доступа. */
export function signServiceAccountAssertion(
  account: Pick<ServiceAccount, 'clientEmail' | 'privateKey'>,
  nowSeconds: number,
): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: account.clientEmail,
      scope: FCM_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(account.privateKey).toString('base64url');
  return `${header}.${claims}.${signature}`;
}

/**
 * Сообщение для одного телефона. Значения `data` в FCM обязаны быть строками.
 * `tag` склеивает уведомления одной беседы в одно, как у веб-пушей.
 */
export function buildFcmMessage(
  token: string,
  payload: PushPayload,
  /**
   * Категория уведомлений Android. По умолчанию «Сообщения» — так вели себя
   * все пуши до VED-361, и так же ведут себя те, кому канал не выбрали.
   * Звонковый пуш обязан приходить со своим каналом: иначе выключенные
   * «Сообщения» гасят и его.
   */
  channelId: string = ANDROID_MESSAGES_CHANNEL_ID,
) {
  return {
    message: {
      token,
      notification: { title: payload.title, body: payload.body },
      data: { url: payload.url, tag: payload.tag },
      android: {
        priority: 'high',
        notification: { channel_id: channelId, tag: payload.tag },
      },
    },
  };
}

/** Нагрузка data-only пуша входящего звонка — все значения станут строками
 *  в `data` FCM-сообщения, других требований у HTTP v1 к `data` нет. */
export interface CallIncomingPushData {
  callId: string;
  conversationId: string;
  kind: 'audio' | 'video';
  callerName: string;
  /** `null`/отсутствие аватара не кладём ключом в `data` вовсе — ключа с
   *  пустой строкой приложению разбирать сложнее, чем его отсутствия. */
  callerAvatarUrl: string | null;
  /** ISO-момент истечения дозвона. */
  expiresAt: string;
}

export interface CallEndedPushData {
  callId: string;
  reason: string;
}

/**
 * Data-only сообщение входящего звонка: без блока `notification` — экран
 * вызова и рингтон рисует само приложение (`@react-native-firebase/messaging`
 * `setBackgroundMessageHandler`), системный баннер ему бы только мешал.
 * `android.priority = high` и `ttl` — буквальные требования VED-220.
 */
export function buildCallIncomingMessage(
  token: string,
  data: CallIncomingPushData,
) {
  return {
    message: {
      token,
      data: {
        type: CALL_PUSH_TYPE_INCOMING,
        callId: data.callId,
        conversationId: data.conversationId,
        kind: data.kind,
        callerName: data.callerName,
        ...(data.callerAvatarUrl
          ? { callerAvatarUrl: data.callerAvatarUrl }
          : {}),
        expiresAt: data.expiresAt,
      },
      android: {
        priority: 'high',
        ttl: `${CALL_INCOMING_TTL_SECONDS}s`,
      },
    },
  };
}

/** Data-only сигнал «звонок снят»: гасит рингтон на устройствах, которые не
 *  участвуют в разговоре. Тоже без `notification` — показывать тут нечего. */
export function buildCallEndedMessage(token: string, data: CallEndedPushData) {
  return {
    message: {
      token,
      data: {
        type: CALL_PUSH_TYPE_ENDED,
        callId: data.callId,
        reason: data.reason,
      },
      android: {
        priority: 'high',
        ttl: `${CALL_ENDED_TTL_SECONDS}s`,
      },
    },
  };
}

interface FcmErrorBody {
  error?: {
    details?: { errorCode?: string }[];
  };
}

/**
 * Удалять токен можно, только когда FCM прямо говорит, что его больше нет.
 * `INVALID_ARGUMENT` бывает и от ошибки в самом сообщении: сочтя его мёртвым
 * токеном, одна опечатка в коде стёрла бы телефоны у всех.
 */
export function classifyFcmError(status: number, body: unknown): PushFailure {
  const errorCode = (body as FcmErrorBody | null)?.error?.details?.find(
    (detail) => detail.errorCode,
  )?.errorCode;
  if (
    status === 404 ||
    errorCode === 'UNREGISTERED' ||
    errorCode === 'SENDER_ID_MISMATCH'
  )
    return 'gone';
  if (status === 429 || errorCode === 'QUOTA_EXCEEDED') return 'rate-limited';
  return 'transient';
}
