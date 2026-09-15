import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { appVariant } from '@/config/app-variant';
import { useSession } from '@/lib/auth/session';
import { isConversationOpen } from './active-chat';
import { registerDevice } from './push-api';
import { pushTarget, pushUrlOf } from './push-url';

/** Тот же идентификатор канала, что шлёт сервер в `android.notification.channel_id`. */
const CHANNEL_ID = 'messages';

// Пока приложение открыто, пуш показывается, если только беседа из него уже
// не на экране.
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

function openFromNotification(notification: Notifications.Notification): void {
  const target = pushTarget(pushUrlOf(notification));
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
        const { data } = await Notifications.getDevicePushTokenAsync();
        if (!cancelled && typeof data === 'string') await send(data);
      } catch {
        // Сборка без google-services.json не умеет FCM: чаты работают и без пушей.
      }
    })();

    const rotation = Notifications.addPushTokenListener(({ data }) => {
      if (typeof data === 'string') void send(data);
    });
    return () => {
      cancelled = true;
      rotation.remove();
    };
  }, [signed, api]);

  useEffect(() => {
    if (!signed) return;
    // Приложение запустили нажатием на пуш: ответ уже лежит.
    const last = Notifications.getLastNotificationResponse();
    if (last?.notification) openFromNotification(last.notification);
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      openFromNotification(response.notification);
    });
    return () => subscription.remove();
  }, [signed]);

  return null;
}
