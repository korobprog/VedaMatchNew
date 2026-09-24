import { getMessaging, getToken } from '@react-native-firebase/messaging';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { appVariant } from '@/config/app-variant';
import { ensureCallNotificationChannel } from '@/lib/calls/native-call-bridge';
import type { ApiClient } from '@/lib/api/client';
import { installedVersionCode } from './app-version-code';
import { registerDevice } from './push-api';
import { setPushRegistration, type PushRegistration } from './push-registration';

/** Тот же идентификатор канала, что шлёт сервер в `android.notification.channel_id`. */
export const CHANNEL_ID = 'messages';

/**
 * Категория «Звонки» (VED-361). Отдельный канал, а не важность внутри
 * «Сообщений»: категория — единица, которой Android даёт человеку тумблер,
 * звук и режим «не беспокоить». Пока канал был один, выключенные «Сообщения»
 * гасили и входящий вызов, причём молча — сервер честно слал, система прятала.
 *
 * Идентификатор совпадает со строкой сервера
 * (`apps/api/.../notifications/android-channel.ts`): пуш в незаведённый канал
 * Android кладёт в служебный `fallback`, где ни звука звонка, ни настройки.
 */
export const CALLS_CHANNEL_ID = 'calls';

/**
 * Регистрация телефона точкой доставки: канал Android, разрешение, токен FCM
 * и отправка его на сервер.
 *
 * Раньше это тело жило внутри `push-bridge.tsx` и итог держало при себе.
 * Теперь ровно та же последовательность вызывается из двух мест — при запуске
 * (мост) и по кнопке «Зарегистрировать заново» в разделе доставки
 * (VED-329), — а чем она кончилась, пишется в `push-registration.ts`, откуда
 * раздел это и читает. Две копии одной последовательности разошлись бы уже на
 * первой правке, поэтому копия одна.
 *
 * Разрешение спрашивается только пока Android разрешает спрашивать: после
 * отказа окно больше не появится, и единственный путь — системные настройки.
 */
export async function registerThisDevice(
  api: ApiClient,
  /**
   * Отмена. Окно разрешения и выдача токена идут секундами, и за это время
   * человек может выйти из аккаунта: регистрировать его телефон на уже
   * покинутый аккаунт нельзя. Флаг был в мосте до выноса
   * (`push-bridge.tsx`) и вернулся сюда вместе с последовательностью.
   */
  isCancelled: () => boolean = never,
): Promise<PushRegistration> {
  // Ни один вызов не ждёт исключения: мост зовёт это через `void`, а кнопка
  // раздела — ради итога. Неожиданный отказ (канал, сам модуль уведомлений)
  // приравнивается к «не дошло»: человеку от этого помогает повтор.
  const result = await attempt(api, isCancelled).catch((): PushRegistration => 'failed');
  // Отменённая попытка молчит: её итог относится к прежнему аккаунту.
  if (isCancelled()) return 'unknown';
  setPushRegistration(result);
  return result;
}

const never = (): boolean => false;

/**
 * Две категории уведомлений: «Сообщения» и «Звонки» (VED-361).
 *
 * «Сообщения» заводит `expo-notifications` — как и раньше. «Звонки» заводит
 * нативный модуль звонков: канал `calls` у него уже есть (рингтон, вибрация,
 * показ на экране блокировки, `CallNotifications.kt`), но создавался он
 * лениво — при первом входящем. Из-за этого категории не было в системных
 * настройках, пока человеку впервые не позвонят, а пуш сервера в канал
 * `calls` (пропущенный, зов в комнату, фолбэк) Android клал в служебный
 * `fallback`. Завести его тут своими руками нельзя: `expo-notifications` не
 * умеет ни системный рингтон, ни `VISIBILITY_PUBLIC`, а канал, созданный
 * первым, потом уже не переопределить — нативное определение оказалось бы
 * подменено худшим.
 *
 * Отдельная функция, а не строки внутри `attempt`: каналы заводятся и при
 * первом запуске, и по кнопке «Зарегистрировать заново», и проверяются
 * тестом (`device-registration.spec.ts`) без всей регистрации целиком.
 */
export async function createChannels(): Promise<void> {
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Сообщения',
    description: 'Переписка, заявки и новости. Звонки — отдельная категория.',
    importance: Notifications.AndroidImportance.HIGH,
  });
  ensureCallNotificationChannel();
}

async function attempt(
  api: ApiClient,
  isCancelled: () => boolean,
): Promise<PushRegistration> {
  // Каналы нужны до запроса разрешения: без них Android 13 не покажет окно.
  await createChannels();
  const current = await Notifications.getPermissionsAsync();
  const granted =
    current.granted || (current.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
  if (isCancelled()) return 'unknown';
  if (!granted) return 'no-permission';

  let token: string | null = null;
  try {
    // Тот же FCM-токен, что раньше отдавал `getDevicePushTokenAsync` —
    // источник другой (RNFB, а не expo-notifications), контракт с сервером
    // (`POST /notifications/devices`) не меняется.
    token = await getToken(getMessaging());
  } catch {
    // Сборка без google-services.json не умеет FCM: чаты работают и без пушей.
    return 'no-token';
  }
  if (!token) return 'no-token';
  // Последняя проверка перед самим запросом: дальше отменять уже поздно.
  if (isCancelled()) return 'unknown';
  return sendToken(api, token);
}

/**
 * Отправка уже полученного токена. Отдельно от `attempt`, потому что этим же
 * путём уходит токен, обновлённый самим FCM (`onTokenRefresh`): там разрешение
 * и канал спрашивать не надо, а записать итог — надо.
 */
export async function sendDeviceToken(api: ApiClient, token: string): Promise<PushRegistration> {
  const result = await sendToken(api, token).catch((): PushRegistration => 'failed');
  setPushRegistration(result);
  return result;
}

async function sendToken(api: ApiClient, token: string): Promise<PushRegistration> {
  try {
    const variant = appVariant();
    await registerDevice(api, {
      token,
      provider: 'fcm',
      platform: 'android',
      appVariant: `${variant.contour}-${variant.channel}`,
      // Устройство умеет нативный экран звонка по data-пушу (VED-220/221):
      // сервер перестаёт слать этому телефону обычный пуш «вам звонят».
      nativeCalls: true,
      // Номер установленной сборки: по нему сервер зовёт обновиться
      // телефоны со сборкой с сайта, отставшие от вышедшей версии.
      appVersionCode: installedVersionCode(Constants.expoConfig?.android?.versionCode),
    });
    return 'registered';
  } catch {
    // Сеть или отказ сервера. Отличать это от «нет токена» важно: человеку
    // здесь помогает повтор, а там — другая сборка.
    return 'failed';
  }
}
