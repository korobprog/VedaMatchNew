/**
 * Пауза перед переподключением потока: 1 с, удваивается до 15 с, как на сайте
 * (`apps/web/src/lib/chat-stream.ts`). Сбрасывается после удачного открытия.
 */
export function streamBackoffMs(attempt: number): number {
  const safe = Math.max(0, Math.floor(attempt));
  return Math.min(15_000, 1_000 * 2 ** Math.min(safe, 4));
}
