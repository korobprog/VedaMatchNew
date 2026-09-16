/**
 * Пауза перед повторной попыткой проактивного `refresh()` после того, как
 * предыдущая попытка вернула `{ kind: 'unavailable' }` (сеть недоступна,
 * сервер лёг на 5xx, таймаут — `token-authority.ts`,
 * `gan-harness/feedback/feedback-003.md`, блокирующий п.1/2). Без этого
 * таймера проактивная сторона молчала бы до следующего явного триггера —
 * которым на практике оказывался бы обычный запрос через `client.ts`,
 * рискующий получить второй 401 и ошибочно закончить сессию.
 *
 * Растёт геометрически (множитель 3: 5с → 15с → 45с → 135с → ...), ограничена
 * потолком — вечно долбить недоступный сервер не нужно, а полностью
 * останавливаться тоже нельзя: `session.tsx` сбрасывает счётчик попыток при
 * успехе и перепланирует немедленную попытку при возврате в передний план
 * (`AppState` → `active`).
 */
export const REFRESH_BACKOFF_BASE_MS = 5_000;
export const REFRESH_BACKOFF_MAX_MS = 5 * 60_000;
const REFRESH_BACKOFF_MULTIPLIER = 3;

/** `attempt` — сколько подряд неудачных попыток УЖЕ было (0 для первой
 *  повторной попытки после самого первого провала). Отрицательные и
 *  дробные значения не ожидаются — на всякий случай трактуются как `0`. */
export function nextRefreshBackoffMs(attempt: number): number {
  const safeAttempt = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 0;
  const delay = REFRESH_BACKOFF_BASE_MS * REFRESH_BACKOFF_MULTIPLIER ** safeAttempt;
  return Math.min(delay, REFRESH_BACKOFF_MAX_MS);
}
