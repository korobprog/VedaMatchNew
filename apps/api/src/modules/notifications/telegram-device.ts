/**
 * Провайдер и платформа устройства доставки через `@vedamatch_bot` — те же
 * строки, что ищет `deliver()` при рассылке (`notifications.listener.ts`).
 *
 * Не входят в `NotificationDeviceProvider`/`NotificationDevicePlatform` из
 * `@vedamatch/shared`: те валидируют регистрацию телефонов с приложением
 * (`POST /notifications/devices`), а телеграм-устройство заводится только
 * `TelegramNotificationsService`, по подписи Telegram, а не произвольным телом
 * запроса.
 *
 * Отдельным файлом, а не рядом с сервисом: строку читает и общий конвейер
 * (`NotificationsService`), который сам инжектится в телеграм-сервис, —
 * держать её там значило бы завести круговой импорт.
 */
export const TELEGRAM_DEVICE_PROVIDER = 'telegram';
export const TELEGRAM_DEVICE_PLATFORM = 'telegram';
