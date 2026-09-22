import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as IntentLauncher from 'expo-intent-launcher';
import { Linking } from 'react-native';
import { CALLS_CHANNEL_ID, CHANNEL_ID } from './device-registration';

/**
 * Категории уведомлений глазами человека и дорога до их настроек (VED-329,
 * раунд 001, дефект 1; две категории — VED-361).
 *
 * Разрешение уровня приложения (`POST_NOTIFICATIONS`) и важность КАНАЛА —
 * разные вещи, и карточка про это спотыкалась: на живом телефоне выключенная
 * категория «Сообщения» оставляла разрешение выданным, сервер по-прежнему
 * числил телефон живой точкой, а раздел обещал, что «сообщения и звонки
 * придут». Android при этом не показывал ничего: сервер шлёт ровно в этот
 * канал (`android.notification.channel_id`), и в него же бьёт мост.
 *
 * Каналов теперь два — «Сообщения» и «Звонки», — и выключить их человек может
 * порознь. Значит и спрашивать надо порознь: одно «выключено» на оба канала
 * снова было бы враньём, только другим.
 */

/** Что известно про одну категорию. */
export type ChannelState =
  /** Канал есть и важность выше «без звука и без показа». */
  | 'on'
  /** Важность `NONE`: Android уведомления этого канала не показывает. */
  | 'off'
  /** Канала ещё нет (первый запуск до регистрации) или спросить не удалось. */
  | 'unknown';

/**
 * Прежнее имя типа. Осталось ради читающего старый код: до VED-361 канал был
 * один, и тип назывался по нему.
 */
export type MessagesChannelState = ChannelState;

/** Обе категории разом — то, чем раздел доставки описывает систему. */
export interface NotificationChannelsState {
  messages: ChannelState;
  calls: ChannelState;
}

/**
 * Чистая часть: важность канала → состояние. `null` — канала нет; такое бывает
 * до первой регистрации, и обвинять в этом человека нельзя.
 *
 * Шкала здесь СВОЯ, не андроидовская: у `expo-notifications` перечисление
 * сдвинуто (`UNKNOWN = 0`, `UNSPECIFIED = 1`, `NONE = 2`, `MIN = 3`…), поэтому
 * сравнивать нужно с константой, а не с нулём, как в документации Android.
 * `UNKNOWN` — это «модуль не смог перевести», тоже не повод ругаться.
 */
export function channelStateFrom(
  importance: Notifications.AndroidImportance | number | null | undefined,
): ChannelState {
  if (importance === null || importance === undefined) return 'unknown';
  if (importance === Notifications.AndroidImportance.UNKNOWN) return 'unknown';
  return importance === Notifications.AndroidImportance.NONE ? 'off' : 'on';
}

/** Важность одного канала у системы. Отказ — это «не знаем», не «выключен». */
async function readChannel(id: string): Promise<ChannelState> {
  try {
    const channel = await Notifications.getNotificationChannelAsync(id);
    return channelStateFrom(channel?.importance);
  } catch {
    return 'unknown';
  }
}

/** Важность канала «Сообщения» у системы. */
export function readMessagesChannel(): Promise<ChannelState> {
  return readChannel(CHANNEL_ID);
}

/** Важность канала «Звонки» у системы. */
export function readCallsChannel(): Promise<ChannelState> {
  return readChannel(CALLS_CHANNEL_ID);
}

/** Обе категории разом: раздел доставки судит по ним вместе. */
export async function readNotificationChannels(): Promise<NotificationChannelsState> {
  const [messages, calls] = await Promise.all([
    readMessagesChannel(),
    readCallsChannel(),
  ]);
  return { messages, calls };
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
 *
 * Сюда же ведём, когда выключены ОБЕ категории: на этом экране они обе в
 * списке, и человеку не придётся заходить дважды.
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

/** Настройки одной категории: тумблер, который человек и выключил. */
async function openChannelSettings(id: string): Promise<void> {
  try {
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.CHANNEL_NOTIFICATION_SETTINGS,
      { extra: { [EXTRA_APP_PACKAGE]: packageName(), [EXTRA_CHANNEL_ID]: id } },
    );
  } catch {
    await openNotificationSettings();
  }
}

/** Настройки самой категории «Сообщения». */
export function openMessagesChannelSettings(): Promise<void> {
  return openChannelSettings(CHANNEL_ID);
}

/** Настройки самой категории «Звонки» (VED-361). */
export function openCallsChannelSettings(): Promise<void> {
  return openChannelSettings(CALLS_CHANNEL_ID);
}
