import { fetchVapidKey, saveSubscription } from "@/lib/notifications-api";
import {
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
