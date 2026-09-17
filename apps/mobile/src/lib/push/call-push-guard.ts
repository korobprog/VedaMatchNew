/**
 * Правка по факту живой проверки (Samsung Galaxy A51, Android 13,
 * `gan-harness/generator-state.md` этой сессии): в шторке оказалось
 * уведомление о звонке на канале `expo_notifications_fallback_notification_channel`
 * (случайный UUID вместо `callId`, без кнопок «Ответить»/«Отклонить») — это
 * `scheduleNotificationAsync` из `push-bridge.tsx#onMessage`, вызванный БЕЗ
 * `channelId`.
 *
 * Расследование по исходникам сервера (`apps/api/.../notifications/notifications.listener.ts`,
 * `native-push.service.ts`) нашло настоящий источник: устройства с
 * `nativeCalls: true` (это приложение — всегда, `push-bridge.tsx`) для
 * события `chat.call-incoming` корректно получают ТОЛЬКО data-only пуш
 * (`sendCallIncoming` там же ветвится по `nativeCalls`) — но для
 * `chat.call-missed` (звонок не приняли за время дозвона) такого ветвления
 * НЕТ: `notifications.listener.ts` шлёт его через общий `sendToUsers(...)`
 * ВСЕМ устройствам без разбора `nativeCalls`, включая уже умеющие нативный
 * звонок. Настоящий пуш — обычный, с блоком `notification` (`buildFcmMessage`),
 * url вида `/chat/<id>?call=<callId>` (`notification-copy.ts`, кейс
 * `chat.call-missed`) — при свёрнутом приложении система показывает его
 * САМА, минуя весь наш код (см. `docs/mobile-calls-native.md` §11) — этот
 * путь мобильный клиент в принципе не может перехватить, чинить нужно на
 * сервере (другой worktree, `VedaMatchNew-calls-api`, вне этой сессии).
 *
 * Единственное окно, где наш JS ВООБЩЕ видит такой пуш, — если он пришёл,
 * пока приложение уже в переднем плане (`onMessage`, а не системный
 * автопоказ): тогда, без этой проверки, `push-bridge.tsx` показал бы его
 * как обычное сообщение через `scheduleNotificationAsync` — дублируя то,
 * что человек и так уже видит на экране звонка/во вкладке «Звонки». Этот
 * модуль — чистое распознавание «похоже на пуш о звонке» по `data.url`
 * (`/chat/<id>?call=<callId>`, тот же признак, что уже разбирает
 * `push-url.ts#pushTarget`), без сети и без сравнения строк, зашитых в
 * два места по-разному.
 */
export function isCallRelatedPushUrl(url: string | null): boolean {
  return typeof url === 'string' && /[?&]call=/.test(url);
}
