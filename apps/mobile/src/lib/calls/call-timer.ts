/**
 * Таймер разговора — общий для экрана звонка (`app/call/[id].tsx`) и
 * плашки «вернуться» (`components/calls/return-to-call-banner.tsx`), чтобы
 * секунды не расходились между ними и формат не дублировался.
 */

/** Секунды с начала разговора → «м:сс» или «ч:мм:сс». */
export function formatElapsed(totalSeconds: number): string {
  const total = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/** `connectedAt` (ms, из `call-machine.ts`) и текущее время → целые секунды разговора. */
export function elapsedSeconds(since: number | null, nowMs: number): number {
  if (!since) return 0;
  return Math.max(0, Math.floor((nowMs - since) / 1000));
}
