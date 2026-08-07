/**
 * Лимиты знакомств в одном месте. Пока проект в бете всё бесплатно, поэтому
 * квоты щедрые и никак не связаны с подпиской. Когда бета закончится, здесь
 * меняются числа и добавляется проверка `billing` — сервисы трогать не нужно.
 */
export const UNION_LIMITS_MODE: 'beta' | 'paid' = 'beta';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Окно, за которое считаются суточные квоты. */
export const QUOTA_WINDOW_MS = DAY_MS;

/** Сколько суперлайков в сутки. */
export const SUPERLIKES_PER_DAY = UNION_LIMITS_MODE === 'beta' ? 20 : 1;

/** Сколько откатов свайпа в сутки. */
export const UNDO_PER_DAY = UNION_LIMITS_MODE === 'beta' ? 50 : 3;

/** Сколько длится буст «Внимание». */
export const BOOST_DURATION_MS = 40 * 60 * 1000;

/** Начало текущего окна квоты. */
export function quotaWindowStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - QUOTA_WINDOW_MS);
}
