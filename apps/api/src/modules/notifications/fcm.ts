import { createSign } from 'node:crypto';
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
/** Канал уведомлений Android, его же создаёт приложение. */
export const ANDROID_CHANNEL_ID = 'messages';

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
export function buildFcmMessage(token: string, payload: PushPayload) {
  return {
    message: {
      token,
      notification: { title: payload.title, body: payload.body },
      data: { url: payload.url, tag: payload.tag },
      android: {
        priority: 'high',
        notification: { channel_id: ANDROID_CHANNEL_ID, tag: payload.tag },
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
