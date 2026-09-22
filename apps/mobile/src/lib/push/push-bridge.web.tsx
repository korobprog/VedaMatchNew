import { useEffect } from 'react';
import { useSession } from '@/lib/auth/session';
import { syncWebPushSubscription } from './web-push';

/**
 * Веб-сборка (`ios.vedamatch.com`): нативного Firebase в браузере нет, поэтому
 * уведомления идут обычными веб-пушами (VED-313) — обработчики `push` и
 * `notificationclick` живут в `public/sw.js`, а разрешение и подписка
 * запрашиваются кнопкой в «Аккаунте»
 * (`components/notifications/device-push-section.web.tsx`). Дублирование в
 * Telegram-бота остаётся как было и этому не мешает.
 *
 * Здесь — только сверка при запуске: разрешение человек мог выдать когда
 * угодно, а подписку браузер меняет молча, и сообщить об этом на сервер из
 * воркера некому (адреса API в `sw.js` нет, файл лежит в `public/` и через
 * сборку не проходит). Без сверки человек с выданным разрешением однажды
 * остался бы без уведомлений и не понял бы почему.
 *
 * Нативная сборка берёт `push-bridge.tsx` — Firebase, токен устройства,
 * нативный экран звонка. Общего у этих двух файлов только имя.
 */
export function PushBridge() {
  const { status, api } = useSession();
  const signed = status === 'signed';

  useEffect(() => {
    // Подписка привязывается к человеку: гостю её регистрировать некуда.
    if (!signed) return;
    void syncWebPushSubscription(api);
  }, [signed, api]);

  return null;
}
