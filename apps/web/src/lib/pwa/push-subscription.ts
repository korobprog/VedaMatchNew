import type { PushSubscriptionRequest } from "@vedamatch/shared";

export type PushSupport = "unsupported" | "denied" | "default" | "granted";

/** applicationServerKey принимает байты, а VAPID-ключ приходит строкой
 *  в url-safe base64 — со своим алфавитом и без паддинга. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }
  return output;
}

export function toSubscriptionRequest(
  subscription: PushSubscription,
): PushSubscriptionRequest {
  const json = subscription.toJSON() as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  return {
    endpoint: json.endpoint ?? subscription.endpoint,
    keys: {
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
    },
  };
}

export function detectPushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  if (!("Notification" in window) || !("PushManager" in window)) {
    return "unsupported";
  }
  return Notification.permission as PushSupport;
}

// Разрешение браузера — внешнее состояние: читаем его через
// useSyncExternalStore, а не setState в эффекте. События об изменении браузер
// не шлёт, поэтому подписку дёргает сам код после requestPermission.
let listeners: Array<() => void> = [];

export function subscribePushSupport(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((item) => item !== listener);
  };
}

export function notifyPushSupportChanged(): void {
  for (const listener of listeners) listener();
}

/** На сервере разрешения нет и быть не может. */
export function getPushSupportServerSnapshot(): PushSupport {
  return "unsupported";
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function subscribeToPush(
  vapidPublicKey: string,
): Promise<PushSubscription> {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });
}
