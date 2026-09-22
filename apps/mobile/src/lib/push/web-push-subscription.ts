/**
 * Перевод подписки браузера в то, что понимает сервер (VED-313). Устройство
 * взято у основного сайта (`apps/web/src/lib/pwa/push-subscription.ts`) —
 * контракт `POST /notifications/subscriptions` один на оба клиента, и
 * расходиться им незачем.
 *
 * Чистые функции без обращения к DOM: их зовёт только веб-сборка
 * (`web-push.ts`), но проверить их можно где угодно.
 */
import type { PushSubscriptionRequest } from '@vedamatch/shared';

/**
 * `applicationServerKey` принимает байты, а VAPID-ключ приходит с сервера
 * строкой в url-safe base64 — со своим алфавитом и без паддинга.
 */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
  return output;
}

export function toSubscriptionRequest(subscription: PushSubscription): PushSubscriptionRequest {
  const json = subscription.toJSON() as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  return {
    endpoint: json.endpoint ?? subscription.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
  };
}

/** Одинаковы ли байты ключа сервера у уже живущей подписки и у нового ключа. */
export function sameApplicationServerKey(
  current: ArrayBuffer | null | undefined,
  key: Uint8Array,
): boolean {
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === key.length && bytes.every((byte, index) => byte === key[index]);
}
