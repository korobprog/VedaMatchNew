import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as IntentLauncher from 'expo-intent-launcher';
import { Linking } from 'react-native';
import { CHANNEL_ID } from './device-registration';

/**
 * Канал «Сообщения» глазами человека и дорога до его настроек (VED-329,
 * раунд 001, дефект 1).
 *
 * Разрешение уровня приложения (`POST_NOTIFICATIONS`) и важность КАНАЛА —
 * разные вещи, и карточка про это спотыкалась: на живом телефоне выключенная
 * категория «Сообщения» оставляла разрешение выданным, сервер по-прежнему
 * числил телефон живой точкой, а раздел обещал, что «сообщения и звонки
 * придут». Android при этом не показывал ничего: сервер шлёт ровно в этот
 * канал (`android.notification.channel_id`), и в него же бьёт мост.
 */

/** Что известно про канал «Сообщения». */
export type MessagesChannelState =
  /** Канал есть и важность выше «без звука и без показа». */
  | 'on'
  /** Важность `NONE`: Android уведомления этого канала не показывает. */
  | 'off'
  /** Канала ещё нет (первый запуск до регистрации) или спросить не удалось. */
  | 'unknown';

/**
 * Чистая часть: важность канала → состояние. `null` — канала нет; такое бывает
 * до первой регистрации, и обвинять в этом человека нельзя.
 */
export function channelStateFrom(
  importance: Notifications.AndroidImportance | number | null | undefined,
): MessagesChannelState {
  if (importance === null || importance === undefined) return 'unknown';
  return importance === Notifications.AndroidImportance.NONE ? 'off' : 'on';
}

/** Важность канала «Сообщения» у системы. Отказ — это «не знаем», не «выключен». */
export async function readMessagesChannel(): Promise<MessagesChannelState> {
  try {
    const channel = await Notifications.getNotificationChannelAsync(CHANNEL_ID);
    return channelStateFrom(channel?.importance);
  } catch {
    return 'unknown';
  }
}

/** Имя пакета для системных интентов настроек. */
function packageName(): string {
  return Constants.expoConfig?.android?.package ?? 'com.vedamatch.app';
}

const EXTRA_APP_PACKAGE = 'android.provider.extra.APP_PACKAGE';
const EXTRA_CHANNEL_ID = 'android.provider.extra.CHANNEL_ID';

/**
 * Экран уведомлений приложения — не общая страница приложения.
 * `Linking.openSettings()` приводит на `InstalledAppDetails`, где «Уведомления»
 * нужно ещё найти (проверено на устройстве, `ved329-04`), а подсказка обещает
 * именно настройки уведомлений. Если интент не открылся, отступаем на общую
 * страницу: лучше не туда, чем никуда.
 */
export async function openNotificationSettings(): Promise<void> {
  try {
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.APP_NOTIFICATION_SETTINGS,
      { extra: { [EXTRA_APP_PACKAGE]: packageName() } },
    );
  } catch {
    await Linking.openSettings().catch(() => undefined);
  }
}

/** Настройки самой категории «Сообщения»: тумблер, который человек и выключил. */
export async function openMessagesChannelSettings(): Promise<void> {
  try {
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.CHANNEL_NOTIFICATION_SETTINGS,
      { extra: { [EXTRA_APP_PACKAGE]: packageName(), [EXTRA_CHANNEL_ID]: CHANNEL_ID } },
    );
  } catch {
    await openNotificationSettings();
  }
}
