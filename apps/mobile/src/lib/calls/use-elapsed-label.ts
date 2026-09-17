import { useEffect, useMemo, useState } from 'react';
import { elapsedSeconds, formatElapsed } from './call-timer';

/**
 * Тикающий таймер разговора — общий для экрана звонка и плашки
 * «вернуться». Обёртка над `call-timer.ts`, сама не тестируется
 * (`setInterval`/React state), решения — в чистых функциях рядом.
 */
export function useElapsedLabel(since: number | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);
  return useMemo(() => formatElapsed(elapsedSeconds(since, now)), [since, now]);
}
