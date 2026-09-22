/**
 * Веб-пуши сборки `ios.vedamatch.com` (VED-313): разрешение браузера,
 * подписка у пуш-сервиса и её регистрация на портале.
 *
 * Файл живёт только в веб-сборке. Гарантия не в проверке `Platform.OS`, а в
 * графе импортов: его тянут ровно два файла с расширением `.web.tsx`
 * (`push-bridge.web.tsx` и `components/notifications/device-push-section.web.tsx`),
 * а их Metro подставляет вместо нативных однофамильцев только при
 * `platform === 'web'`. В APK и в сборке App Store сюда не ведёт ни одна
 * дорога: там пуши идут через Firebase (`push-bridge.tsx`), и трогать их эта
 * работа не должна.
 */
import type { PushSubscriptionRequest, VapidKeyResponse } from '@vedamatch/shared';
import type { ApiClient } from '@/lib/api/client';
import {
  isIosDevice,
  isStandaloneDisplay,
  type WebPushEnvironment,
  type WebPushSupport,
} from './web-push-state';
import {
  sameApplicationServerKey,
  toSubscriptionRequest,
  urlBase64ToUint8Array,
} from './web-push-subscription';

export type EnableWebPushResult = 'granted' | 'denied' | 'failed';

export function detectWebPushSupport(): WebPushSupport {
  if (typeof window === 'undefined') return 'unsupported';
  if (!('Notification' in window) || !('PushManager' in window)) return 'unsupported';
  if (!('serviceWorker' in navigator)) return 'unsupported';
  return Notification.permission as WebPushSupport;
}

export function detectWebPushEnvironment(): WebPushEnvironment {
  if (typeof window === 'undefined') {
    return { support: 'unsupported', standalone: false, ios: false };
  }
  const legacyStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return {
    support: detectWebPushSupport(),
    standalone: isStandaloneDisplay({
      displayModeStandalone: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
      navigatorStandalone: legacyStandalone,
    }),
    ios: isIosDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0),
  };
}

// Разрешение браузера — внешнее состояние, и событий о его смене браузер не
// шлёт. Читаем через `useSyncExternalStore`, а подписчиков дёргаем сами
// после `requestPermission()` — так же, как на основном сайте.
let listeners: Array<() => void> = [];

export function subscribeWebPushSupport(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((item) => item !== listener);
  };
}

export function notifyWebPushSupportChanged(): void {
  for (const listener of listeners) listener();
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

async function subscribeToPush(vapidPublicKey: string): Promise<PushSubscription> {
  const registration = await navigator.serviceWorker.ready;
  const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
  // Пока жива подписка с другим ключом сервера, subscribe() бросает
  // InvalidStateError. Так бывает после ротации VAPID — снимаем старую.
  const existing = await registration.pushManager.getSubscription();
  if (
    existing &&
    !sameApplicationServerKey(
      existing.options?.applicationServerKey as ArrayBuffer | null,
      applicationServerKey,
    )
  ) {
    await existing.unsubscribe();
  }
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey as BufferSource,
  });
}

async function fetchVapidKey(api: ApiClient): Promise<string> {
  const response = await api.request<VapidKeyResponse>('/notifications/vapid-key');
  if (!response.publicKey) throw new Error('Сервер не отдал ключ для уведомлений');
  return response.publicKey;
}

function saveSubscription(api: ApiClient, body: PushSubscriptionRequest): Promise<{ ok: true }> {
  return api.request<{ ok: true }>('/notifications/subscriptions', { method: 'POST', body });
}

/**
 * «Спросить разрешение и зарегистрировать подписку» — путь кнопки в разделе
 * «Уведомления на этом устройстве». Спросить браузер можно только по жесту
 * человека и только один раз, поэтому зовётся строго из обработчика нажатия.
 *
 * Не бросает: вызывающему нужен исход, а не разбор ошибок браузера и сети.
 */
export async function enableWebPush(api: ApiClient): Promise<EnableWebPushResult> {
  const permission = await Notification.requestPermission();
  notifyWebPushSupportChanged();
  if (permission !== 'granted') return 'denied';
  try {
    const subscription = await subscribeToPush(await fetchVapidKey(api));
    await saveSubscription(api, toSubscriptionRequest(subscription));
    return 'granted';
  } catch {
    // Разрешение уже выдано, а подписку сохранить не вышло: сеть отвалилась
    // или на сервере нет ключей. Пуши не пойдут — и об этом надо сказать.
    return 'failed';
  }
}

/**
 * Приводит подписку в порядок у того, кто разрешение уже выдал: подписки может
 * не быть вовсе (разрешение выдали, когда сервер был без VAPID-ключей), а
 * может быть, но сервер о ней не знает — браузер меняет подписку молча, а
 * сообщить об этом со стороны воркера некому (в `sw.js` нет адреса API).
 *
 * Жеста человека здесь не нужно: разрешение уже есть. Не бросает.
 */
export async function syncWebPushSubscription(api: ApiClient): Promise<void> {
  if (detectWebPushSupport() !== 'granted') return;
  try {
    const existing = await currentSubscription();
    const subscription = existing ?? (await subscribeToPush(await fetchVapidKey(api)));
    await saveSubscription(api, toSubscriptionRequest(subscription));
  } catch {
    // Сеть или пуш-сервис недоступны — повторим при следующем запуске.
  }
}
