/**
 * Сон-таймер. См. docs/music-service-plan.md, этап 9.
 *
 * Чистая логика отдельно от плеера: ошибка здесь не падает, а будит человека
 * среди ночи или, наоборот, оставляет киртан играть до утра.
 */

export type MusicSleepTimer =
  | { mode: "off" }
  /** Остановиться в указанный момент, в миллисекундах эпохи. */
  | { mode: "at"; endsAt: number }
  /** Остановиться, когда доиграет текущая запись. */
  | { mode: "end-of-track" };

export const SLEEP_TIMER_OFF: MusicSleepTimer = { mode: "off" };

/** Ходовые интервалы. Лекцию и киртан ставят на ночь именно так. */
export const SLEEP_MINUTES = [15, 30, 45, 60] as const;

export function sleepTimerAfterMinutes(
  minutes: number,
  now: number,
): MusicSleepTimer {
  const safe = Math.max(1, Math.round(minutes));
  return { mode: "at", endsAt: now + safe * 60_000 };
}

/**
 * Сколько осталось, секунды. `null` — таймер не отсчитывает время: выключен
 * или ждёт конца записи.
 */
export function sleepSecondsLeft(
  timer: MusicSleepTimer,
  now: number,
): number | null {
  if (timer.mode !== "at") return null;
  return Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
}

/** Пора ли останавливать по времени. */
export function shouldStopNow(timer: MusicSleepTimer, now: number): boolean {
  return timer.mode === "at" && now >= timer.endsAt;
}

/**
 * Останавливаться ли на конце записи вместо перехода к следующей.
 *
 * Истёкший таймер «по времени» тоже останавливает: запись могла кончиться на
 * секунду раньше срабатывания, и уходить в следующую в этот момент — ровно
 * то, чего человек просил не делать.
 */
export function shouldStopOnEnded(
  timer: MusicSleepTimer,
  now: number,
): boolean {
  return timer.mode === "end-of-track" || shouldStopNow(timer, now);
}

/** «28 мин» или «45 сек» — подпись отсчёта в полосе плеера. */
export function formatSleepLeft(secondsLeft: number): string {
  if (!Number.isFinite(secondsLeft) || secondsLeft <= 0) return "0 сек";
  if (secondsLeft < 60) return `${Math.ceil(secondsLeft)} сек`;
  return `${Math.ceil(secondsLeft / 60)} мин`;
}
