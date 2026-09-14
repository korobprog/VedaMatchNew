/** «В сети», если был активен последние пять минут, как на сайте (`chat-presence.ts`). */
const ONLINE_MS = 5 * 60 * 1000;

export function isOnline(lastSeenAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!lastSeenAt) return false;
  const seen = new Date(lastSeenAt).getTime();
  if (Number.isNaN(seen)) return false;
  return now.getTime() - seen <= ONLINE_MS;
}
