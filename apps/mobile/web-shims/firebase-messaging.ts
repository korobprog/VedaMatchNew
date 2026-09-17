/**
 * FCM в браузере не работает. Все вызовы в push-bridge.tsx закрыты проверкой
 * Android, эти заглушки нужны только чтобы импорт не падал.
 */
const unsubscribe = () => undefined;
export const getMessaging = () => ({});
export const getToken = async () => null;
export const onTokenRefresh = () => unsubscribe;
export const onMessage = () => unsubscribe;
export const getInitialNotification = async () => null;
export const onNotificationOpenedApp = () => unsubscribe;
export const setBackgroundMessageHandler = () => undefined;
export type FirebaseMessagingTypes = { RemoteMessage: Record<string, unknown> };
