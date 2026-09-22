import {
  getInitialNotification,
  getMessaging,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
} from '@react-native-firebase/messaging';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { handleIncomingCallPush } from '@/lib/calls/native-call-bridge';
import { parseCallPush } from '@/lib/calls/incoming-call-push';
import { useSession } from '@/lib/auth/session';
import { isConversationOpen } from './active-chat';
import { isCallRelatedPushUrl } from './call-push-guard';
import { CHANNEL_ID, registerThisDevice, sendDeviceToken } from './device-registration';
import { pushDestination } from '@/lib/notifications/notification-target';
import { setPushRegistration } from './push-registration';
import { pushTarget, pushUrlOf, rnfbMessageUrlOf } from './push-url';

// Пока приложение открыто, пуш показывается, если только беседа из него уже
// не на экране. Это решает, что делать с уведомлением, которое мы сами же
// и создаём ниже через `scheduleNotificationAsync` — саму доставку теперь
// целиком ведёт `@react-native-firebase/messaging` (см. `openFromNotification`
// и комментарий у `messaging().onMessage`).
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const target = pushTarget(pushUrlOf(notification));
    const hidden = target.kind === 'chat' && isConversationOpen(target.conversationId);
    return {
      shouldShowBanner: !hidden,
      shouldShowList: !hidden,
      shouldPlaySound: !hidden,
      shouldSetBadge: false,
    };
  },
});

/**
 * Переход по нажатию на пуш (VED-330).
 *
 * Раньше здесь стояло `router.navigate('/')` для всего, кроме беседы, — то
 * есть вкладка чатов. Теперь маршрут считает `pushDestination()`: раздел со
 * своим экраном открывается им, раздел без своего экрана — лентой
 * уведомлений, где это же уведомление лежит целиком (почему не браузер —
 * см. комментарий у `pushDestination` в `notification-target.ts`).
 */
function openFromNotification(url: string | null): void {
  const destination = pushDestination(url);
  // `site` из пуша не приходит: `pushDestination` всегда отдаёт маршрут.
  if (destination.kind !== 'route') return;
  router.push(
    destination.params
      ? // `as never` у пути с параметрами: у expo-router `Href` — union
        // строковых литералов маршрутов приложения, а путь приходит из
        // чистого модуля, который карты маршрутов знать не должен. Сами
        // литералы перечислены в `routeOfTarget()` и закреплены его тестом.
        ({ pathname: destination.pathname, params: destination.params } as never)
      : (destination.pathname as never),
  );
}

/**
 * Пуши в приложении: канал Android, разрешение, токен FCM на сервер и переход
 * в беседу по нажатию. Работает только у вошедшего: токен привязывается к
 * человеку.
 *
 * Приём FCM целиком у `@react-native-firebase/messaging` — решение этапа 0
 * (`docs/mobile-calls-native.md`, §4 и §11): `expo-notifications` больше не
 * регистрирует свой `FirebaseMessagingService` (манифест правит
 * `plugins/with-native-calls.js`), два приёмника на один intent-filter
 * `com.google.firebase.MESSAGING_EVENT` были бы гонкой без гарантии
 * победителя. `expo-notifications` остаётся презентационным слоем для
 * обычных пушей чата на переднем плане (`scheduleNotificationAsync` ниже) и
 * источником канала/разрешения — его собственный путь приёма пушей просто
 * не используется.
 */
export function PushBridge() {
  const { status, api } = useSession();
  const signed = status === 'signed';

  useEffect(() => {
    if (!signed || Platform.OS !== 'android') return;
    // Сама последовательность (канал → разрешение → токен → сервер) живёт в
    // `device-registration.ts`: её же повторяет кнопка «Зарегистрировать
    // заново» в разделе доставки, и она же записывает итог, который этот
    // раздел показывает человеку (VED-329).
    //
    // Отмена обязательна: окно разрешения и выдача токена идут секундами, и
    // выход из аккаунта в этот момент не должен закончиться регистрацией
    // телефона на покинутый аккаунт. Флаг был здесь до выноса
    // последовательности и вернулся вместе с ней (раунд 001, дефект 5).
    let cancelled = false;
    void registerThisDevice(api, () => cancelled);

    const rotation = onTokenRefresh(getMessaging(), (token) => {
      if (cancelled || typeof token !== 'string') return;
      void sendDeviceToken(api, token);
    });
    return () => {
      cancelled = true;
      rotation();
      // Итог относится к прежнему аккаунту: следующий человек в том же
      // процессе не должен увидеть чужое «зарегистрирован».
      setPushRegistration('unknown');
    };
  }, [signed, api]);

  // Пуш пришёл, пока RNFB считает приложение передним планом: не показываем
  // обычное уведомление сам — здесь показываем сообщение через
  // expo-notifications (тем же каналом/обработчиком, что и раньше). Звонки
  // раньше этот путь пропускал целиком (считалось, что входящий и так идёт
  // через общий поток `chat-stream.tsx` → `call-provider.tsx`,
  // `IncomingCallBanner`) — живая проверка (VED-222, BUG D) нашла в этом
  // дыру: RNFB классифицирует «передний план» по важности процесса
  // (`SharedUtils.isAppInForeground`), а не по тому, разблокирован ли
  // экран, — на заблокированном телефоне с живым процессом `onMessage`
  // срабатывает именно здесь, а не в `background-handler.ts`, и пуш о
  // звонке тихо терялся: JS-баннер за блокировкой никто не видел и не
  // слышал, нативный `showIncomingCall` не звался вовсе. Теперь пуш о
  // звонке идёт через `handleIncomingCallPush` — она сама сверяется с
  // фактическим `AppState` (`decideIncomingCallPresentation`,
  // `incoming-call-presentation.ts`) и решает, нужен ли нативный экран; на
  // ДЕЙСТВИТЕЛЬНО переднем плане это по-прежнему no-op (дедуп по `callId`,
  // `callLifecycleTracker` общий с `call-provider.tsx#showIncomingCallFromStream`)
  // — SSE и так уже показал баннер, как раньше.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    return onMessage(getMessaging(), async (remoteMessage) => {
      const data = remoteMessage.data as Record<string, unknown> | undefined;
      const callPush = parseCallPush(data);
      if (callPush) {
        if (callPush.type === 'call.incoming') await handleIncomingCallPush(callPush);
        return;
      }
      const notification = remoteMessage.notification;
      if (!notification) return;
      // Правка по факту живой проверки (`call-push-guard.ts`): обычный пуш о
      // звонке (входящем-фолбэке или пропущенном, `notification-copy.ts` на
      // сервере — `url` вида `/chat/<id>?call=<callId>`) сервер сейчас шлёт
      // ВСЕМ устройствам человека, включая уже умеющие нативный звонок
      // (известное ограничение сервера, см. `docs/mobile-calls-native.md`
      // §12 — правка не в этом клиенте). Здесь, в переднем плане, у нас есть
      // шанс не задублировать: то же самое человек уже видит на экране
      // звонка/во вкладке «Звонки» через `call-provider.tsx`.
      if (isCallRelatedPushUrl(pushUrlOf({ request: { content: { data } } }))) return;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title ?? 'VedaMatch',
          body: notification.body ?? '',
          data: data ?? {},
        },
        // Без канала уведомление уходит на служебный
        // `expo_notifications_fallback_notification_channel` вместо
        // `messages` — сам этот факт и вскрыла живая проверка.
        trigger: { channelId: CHANNEL_ID },
      });
    });
  }, []);

  useEffect(() => {
    if (!signed) return;
    // Приложение запустили нажатием на пуш, который в этот момент уже был
    // презентован: expo-notifications знает про него, если мы сами его
    // показали (см. `onMessage` выше). Для пуша, который показала система
    // напрямую (свёрнутое/убитое приложение, обычный пуш с `notification`),
    // ответ несёт RNFB — `getInitialNotification`/`onNotificationOpenedApp`.
    const last = Notifications.getLastNotificationResponse();
    if (last?.notification) openFromNotification(pushUrlOf(last.notification));
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      openFromNotification(pushUrlOf(response.notification));
    });

    let cancelled = false;
    let unsubscribeOpenedApp = () => undefined as void;
    if (Platform.OS === 'android') {
      void getInitialNotification(getMessaging()).then((message) => {
        if (cancelled || !message) return;
        openFromNotification(rnfbMessageUrlOf(message));
      });
      unsubscribeOpenedApp = onNotificationOpenedApp(getMessaging(), (message) => {
        openFromNotification(rnfbMessageUrlOf(message));
      });
    }

    return () => {
      subscription.remove();
      cancelled = true;
      unsubscribeOpenedApp();
    };
  }, [signed]);

  return null;
}
