/**
 * Чем кончилась попытка зарегистрировать этот телефон точкой доставки
 * (VED-329).
 *
 * Зачем отдельное хранилище. Раньше итог знал только `push-bridge.tsx` и
 * молчал о нём: разрешения нет — тишина, сборка без `google-services.json` —
 * тишина, токен не дошёл до сервера — тоже тишина. Человек при этом видел на
 * экране «Аккаунт» пустоту и считал, что уведомления работают. Раздел доставки
 * читает отсюда, а мост — пишет.
 *
 * Хранилище живёт ровно столько, сколько процесс приложения: это итог ЭТОГО
 * запуска, а не то, что когда-то было записано на диск. Подписка сделана
 * руками (`useSyncExternalStore`), чтобы модуль остался чистым и тестируемым
 * без React.
 */

export type PushRegistration =
  /** В этом запуске ещё не пробовали (или платформа регистрацию не делает). */
  | 'unknown'
  /** Android не дал разрешения показывать уведомления. */
  | 'no-permission'
  /** Разрешение есть, но FCM не выдал токен: сборка без `google-services.json`. */
  | 'no-token'
  /** Токен есть, но до сервера не дошёл: сеть или ошибка запроса. */
  | 'failed'
  /** Токен ушёл на сервер — телефон числится точкой доставки. */
  | 'registered';

let current: PushRegistration = 'unknown';
const listeners = new Set<() => void>();

export function pushRegistration(): PushRegistration {
  return current;
}

/** Ставит итог и будит подписчиков. Повтор того же значения никого не будит. */
export function setPushRegistration(next: PushRegistration): void {
  if (current === next) return;
  current = next;
  for (const listener of [...listeners]) listener();
}

export function subscribePushRegistration(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Только для тестов: вернуть модуль в исходное состояние. */
export function resetPushRegistration(): void {
  current = 'unknown';
  listeners.clear();
}
