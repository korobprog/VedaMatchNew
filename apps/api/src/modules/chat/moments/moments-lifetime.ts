import { CHAT_MOMENT_TTL_HOURS } from '@vedamatch/shared';

/**
 * Сроки жизни момента.
 *
 * Исчезновение для человека обеспечивает условие `expiresAt > now` в самом
 * запросе, а не уборщик: остановленный уборщик оставит мусор в таблице, но
 * никогда не покажет просроченное. Тот же расчёт, что у протухания
 * объявлений (`notices-worker.service.ts`).
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** По умолчанию строку и файл убирают через неделю после сгорания. */
export const DEFAULT_GRACE_DAYS = 7;
const MIN_GRACE_DAYS = 1;
const MAX_GRACE_DAYS = 90;

export function momentExpiresAt(now: Date): Date {
  return new Date(now.getTime() + CHAT_MOMENT_TTL_HOURS * HOUR_MS);
}

/**
 * Отсрочка перед физическим удалением. Сгоревший момент перестаёт
 * показываться сразу, но строка живёт ещё несколько дней: жалобу на него
 * разбирают позже, чем сутки, и модератор не должен открывать пустоту.
 */
export function purgeCutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

/** Разбор `CHAT_MOMENT_GRACE_DAYS`: мусор в окружении не должен менять поведение. */
export function graceDays(raw: string | undefined): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_GRACE_DAYS;
  const rounded = Math.round(parsed);
  if (rounded < MIN_GRACE_DAYS || rounded > MAX_GRACE_DAYS)
    return DEFAULT_GRACE_DAYS;
  return rounded;
}

/** Начало суток по времени сервера — граница суточного лимита публикаций. */
export function dayStart(now: Date): Date {
  return new Date(now.getTime() - DAY_MS);
}
