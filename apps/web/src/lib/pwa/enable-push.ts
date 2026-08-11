import { fetchVapidKey, saveSubscription } from "@/lib/notifications-api";
import {
  currentSubscription,
  notifyPushSupportChanged,
  subscribeToPush,
  toSubscriptionRequest,
} from "./push-subscription";

export type EnablePushResult = "granted" | "denied" | "failed";

/** Общий путь «спросить разрешение и зарегистрировать подписку»: его проходят
 *  и окно после установки, и переключатель в настройках. Не бросает —
 *  вызывающему нужен исход, а не разбор ошибок браузера и сети. */
export async function enablePush(): Promise<EnablePushResult> {
  // Спросить можно только по жесту пользователя и только один раз.
  const permission = await Notification.requestPermission();
  notifyPushSupportChanged();
  if (permission !== "granted") return "denied";
  try {
    const key = await fetchVapidKey();
    const subscription = await subscribeToPush(key);
    await saveSubscription(toSubscriptionRequest(subscription));
    return "granted";
  } catch {
    // Разрешение уже выдано, но подписку сохранить не вышло: ключей нет на
    // сервере или сеть отвалилась. Пуши не пойдут — надо сказать об этом.
    return "failed";
  }
}

/**
 * Приводит подписку в порядок у того, кто разрешение уже выдал. Два случая:
 * подписки нет вовсе (разрешение выдали, когда сервер был без VAPID-ключей —
 * тогда subscribe() падал, и человек навсегда оставался без пушей: спросить
 * повторно браузер не даст, а окно ему больше не показывается) и подписка
 * есть, но сервер о ней не знает — браузер меняет её молча.
 *
 * Жест пользователя здесь не нужен: разрешение уже есть. Не бросает.
 */
export async function syncPushSubscription(): Promise<void> {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    const existing = await currentSubscription();
    const subscription = existing ?? (await subscribeToPush(await fetchVapidKey()));
    await saveSubscription(toSubscriptionRequest(subscription));
  } catch {
    // Сеть или пуш-сервис недоступны — повторим при следующей загрузке.
  }
}
