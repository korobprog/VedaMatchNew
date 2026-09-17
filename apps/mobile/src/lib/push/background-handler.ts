import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';
import { handleCallEndedPush, handleIncomingCallPush } from '@/lib/calls/native-call-bridge';
import { parseCallPush } from '@/lib/calls/incoming-call-push';

/**
 * Фоновый обработчик FCM (VED-221, п.2). Импорт этого модуля сам по себе —
 * побочный эффект: `setBackgroundMessageHandler` регистрирует headless-задачу
 * `ReactNativeFirebaseMessagingHeadlessTask` (внутри
 * `@react-native-firebase/messaging`, не наша), которую Android поднимает
 * даже из убитого приложения. `index.js` импортирует этот файл раньше
 * `expo-router/entry` — регистрация должна случиться до первого рендера
 * (решение этапа 0, `docs/mobile-calls-native.md`, §4).
 *
 * RNFB — единственный приёмник FCM на Android (`FirebaseMessagingService`
 * у `expo-notifications` вырезан из манифеста, `plugins/with-native-calls.js`),
 * поэтому сюда в принципе может прийти что угодно — но по-настоящему
 * обрабатываются только звонки: сообщения с `notification`-блоком (обычные
 * пуши чата, `apps/api/.../fcm.ts` → `buildFcmMessage`) система показывает
 * сама и в фоне, и в убитом приложении, минуя всякий JS-код вовсе — здесь
 * они бы всё равно не появились.
 */
setBackgroundMessageHandler(getMessaging(), async (remoteMessage) => {
  const push = parseCallPush(remoteMessage.data as Record<string, unknown> | undefined);
  if (!push) return;
  if (push.type === 'call.incoming') await handleIncomingCallPush(push);
  else await handleCallEndedPush(push);
});
