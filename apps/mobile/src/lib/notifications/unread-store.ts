/**
 * Счётчик непрочитанных уведомлений, общий на всё приложение (VED-330).
 *
 * Зачем хранилище, а не состояние экрана. Число носит на себе колокольчик в
 * шапке «Чатов», а меняет его лента: открыл уведомление — значок обязан
 * уменьшиться сразу, не дожидаясь, пока человек вернётся на вкладку и та
 * сходит на сервер. Два места, одно число.
 *
 * Живёт ровно столько, сколько процесс приложения: это не кэш на диске, а
 * последнее, что сказал сервер в этом запуске. Подписка сделана руками, без
 * React (`useSyncExternalStore` берёт её снаружи), — тот же приём, что у
 * `lib/push/push-registration.ts`, и по той же причине: модуль остаётся
 * чистым и проверяется без рендера.
 */

let current = 0;
const listeners = new Set<() => void>();

export function unreadCount(): number {
  return current;
}

/** Ставит число от сервера. Отрицательное не бывает, но приходит — обрежем. */
export function setUnreadCount(next: number): void {
  const value = Number.isFinite(next) ? Math.max(0, Math.trunc(next)) : 0;
  if (current === value) return;
  current = value;
  for (const listener of [...listeners]) listener();
}

/**
 * Уменьшить на `by` — когда человек открыл уведомление. Именно так, а не
 * перезапросом: ответ сервера придёт уже после перехода на другой экран, а
 * значок должен погаснуть под пальцем.
 */
export function decreaseUnreadCount(by = 1): void {
  setUnreadCount(current - by);
}

export function subscribeUnreadCount(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Только для тестов: вернуть модуль в исходное состояние. */
export function resetUnreadCount(): void {
  current = 0;
  listeners.clear();
}
