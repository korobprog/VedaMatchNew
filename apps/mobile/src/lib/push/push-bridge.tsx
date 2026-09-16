import {
  getInitialNotification,
  getMessaging,
  getToken,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
} from '@react-native-firebase/messaging';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { appVariant } from '@/config/app-variant';
import { parseCallPush } from '@/lib/calls/incoming-call-push';
import { useSession } from '@/lib/auth/session';
import { isConversationOpen } from './active-chat';
import { registerDevice } from './push-api';
import { pushTarget, pushUrlOf } from './push-url';

/** Тот же идентификатор канала, что шлёт сервер в `android.notification.channel_id`. */
const CHANNEL_ID = 'messages';

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

function openFromNotification(url: string | null): void {
  const target = pushTarget(url);
  if (target.kind === 'chat') {
    router.push({ pathname: '/chat/[id]', params: { id: target.conversationId } });
  } else {
    router.navigate('/');
  }
}

/**
 * Пуши в приложении: канал Android, разрешение, токен FCM на сервер и переход
 * в беседу по нажатию. Работает только у вошедшего: токен привязывается к
 * человеку.
 *
 * Приём FCM целиком у `@react-native-firebase/messaging` — решение этапа 0
 * (`docs/mobile-calls-native.md`, §4 и §9): `expo-notifications` больше не
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
    let cancelled = false;
    const variant = appVariant();
    const send = (token: string) =>
      registerDevice(api, {
        token,
        provider: 'fcm',
        platform: 'android',
        appVariant: `${variant.contour}-${variant.channel}`,
        // Устройство умеет нативный экран звонка по data-пушу (VED-220/221):
        // сервер перестаёт слать этому телефону обычный пуш «вам звонят».
        nativeCalls: true,
      }).catch(() => undefined);

    void (async () => {
      // Канал нужен до запроса разрешения: без него Android 13 не покажет окно.
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Сообщения',
        importance: Notifications.AndroidImportance.HIGH,
      });
      const current = await Notifications.getPermissionsAsync();
      const granted = current.granted || (current.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
      if (!granted || cancelled) return;
      try {
        // Тот же FCM-токен, что раньше отдавал `getDevicePushTokenAsync` —
        // источник другой (RNFB, а не expo-notifications), контракт с
        // сервером (`POST /notifications/devices`) не меняется.
        const token = await getToken(getMessaging());
        if (!cancelled && token) await send(token);
      } catch {
        // Сборка без google-services.json не умеет FCM: чаты работают и без пушей.
      }
    })();

    const rotation = onTokenRefresh(getMessaging(), (token) => {
      if (typeof token === 'string') void send(token);
    });
    return () => {
      cancelled = true;
      rotation();
    };
  }, [signed, api]);

  // Пуш пришёл, пока приложение в переднем плане: RNFB не показывает
  // уведомление сам — здесь показываем сообщение через expo-notifications
  // (тем же каналом/обработчиком, что и раньше). Звонки этот путь
  // сознательно не трогает: пока приложение в переднем плане, входящий уже
  // идёт через общий поток `chat-stream.tsx` → `call-provider.tsx`
  // (`IncomingCallBanner`, этап 1) — тот же самый звонок, вызванный вторым
  // путём отсюда, показал бы системный полноэкранный вызов поверх уже
  // видимого баннера. FCM в переднем плане и так дублирует то, что уже
  // идёт по SSE: сервер шлёт data-пуш независимо от того, открыто ли
  // приложение, он ему не виден. Полноэкранный вызов для свёрнутого/убитого
  // приложения поднимает `background-handler.ts` — Android направляет туда
  // ровно те состояния, где SSE недоступен (`SharedUtils.isAppInForeground`
  // в самом RNFB).
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    return onMessage(getMessaging(), async (remoteMessage) => {
      const data = remoteMessage.data as Record<string, unknown> | undefined;
      if (parseCallPush(data)) return;
      const notification = remoteMessage.notification;
      if (!notification) return;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title ?? 'VedaMatch',
          body: notification.body ?? '',
          data: data ?? {},
        },
        trigger: null,
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
        const url = message.data?.url;
        openFromNotification(typeof url === 'string' ? url : null);
      });
      unsubscribeOpenedApp = onNotificationOpenedApp(getMessaging(), (message) => {
        const url = message.data?.url;
        openFromNotification(typeof url === 'string' ? url : null);
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
