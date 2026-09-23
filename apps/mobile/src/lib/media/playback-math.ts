/**
 * Арифметика плеера Медиатеки (VED-331): перемотка, подписи времени,
 * прослушанное для истории и свежесть подписанной ссылки на звук.
 */

/**
 * Шаг кнопок «−10/+10». Тот же, что у экрана блокировки: шаг там зашит в
 * `expo-audio` (`SEEK_INTERVAL_MS`), и две разные перемотки для одной
 * записи сбивали бы с толку.
 */
export const SKIP_SECONDS = 10;

export function clampPosition(positionSec: number, durationSec: number): number {
  if (!Number.isFinite(positionSec) || positionSec < 0) return 0;
  if (durationSec > 0 && positionSec > durationSec) return durationSec;
  return positionSec;
}

export function skipBy(positionSec: number, deltaSec: number, durationSec: number): number {
  return clampPosition(positionSec + deltaSec, durationSec);
}

/** Доля дорожки (0…1) → секунда записи. Касание мимо дорожки — к краю. */
export function positionFromRatio(ratio: number, durationSec: number): number {
  if (!(durationSec > 0) || !Number.isFinite(ratio)) return 0;
  return Math.min(Math.max(ratio, 0), 1) * durationSec;
}

export function progressRatio(positionSec: number, durationSec: number): number {
  if (!(durationSec > 0) || !Number.isFinite(positionSec)) return 0;
  return Math.min(Math.max(positionSec / durationSec, 0), 1);
}

/** «4:07», «1:02:09». Неизвестное время — «0:00», а не «NaN:NaN». */
export function formatClock(totalSec: number): string {
  const safe = Number.isFinite(totalSec) && totalSec > 0 ? Math.floor(totalSec) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${ss}` : `${minutes}:${ss}`;
}

/** То же словами — для скринридера: «4 мин 7 с», а не «четыре двоеточие ноль семь». */
export function spokenClock(totalSec: number): string {
  const safe = Number.isFinite(totalSec) && totalSec > 0 ? Math.floor(totalSec) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ч`);
  if (minutes > 0 || hours > 0) parts.push(`${minutes} мин`);
  parts.push(`${seconds} с`);
  return parts.join(' ');
}

/**
 * Сколько секунд человек действительно прослушал между двумя снимками
 * статуса. Засчитываем только ход вперёд, пока играет, и не больше
 * `maxStepSec` за шаг: перемотка вперёд — не прослушивание, а пропуск.
 */
export function listenedBetween(prevSec: number | null, nextSec: number, playing: boolean, maxStepSec = 5): number {
  if (!playing || prevSec === null || !Number.isFinite(nextSec)) return 0;
  const delta = nextSec - prevSec;
  return delta > 0 && delta <= maxStepSec ? delta : 0;
}

/** Раз в сколько секунд плеер докладывает серверу — как сайт. */
export const HEARTBEAT_INTERVAL_SEC = 30;

/**
 * Годна ли ещё подписанная ссылка на звук. Ссылка S3 живёт шесть часов;
 * берём новую с запасом, чтобы она не истекла посреди докачки: запись,
 * поставленная на паузу вечером, утром иначе молча не заиграла бы.
 */
export function isStreamUrlFresh(
  fetchedAtMs: number,
  expiresInSeconds: number,
  nowMs: number,
  marginSec = 10 * 60,
): boolean {
  if (!(expiresInSeconds > 0)) return false;
  return nowMs - fetchedAtMs < (expiresInSeconds - marginSec) * 1000;
}
