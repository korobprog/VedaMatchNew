import type { UnionBoostStatus, UserReportReason } from '@vedamatch/shared';

/**
 * Жалоба и «Внимание» — то, что на экранах держится на паре чистых правил.
 */

/** Причины жалобы — те же слова и тот же порядок, что в `report-block-menu.tsx`. */
export const REPORT_REASONS: readonly { value: UserReportReason; label: string }[] = [
  { value: 'spam', label: 'Спам или реклама' },
  { value: 'harassment', label: 'Оскорбления, домогательства' },
  { value: 'fake_profile', label: 'Фейковый профиль' },
  { value: 'inappropriate_content', label: 'Недопустимый контент' },
  { value: 'offline_safety', label: 'Небезопасное поведение вне сервиса' },
  { value: 'other', label: 'Другое' },
];

/** Столько же принимает сервер (`maxLength` у поля на сайте). */
export const REPORT_COMMENT_MAX = 1000;

/** Пустой комментарий уходит как `null`: «ничего не написал» — не пустая строка. */
export function reportComment(raw: string): string | null {
  const text = raw.trim();
  return text ? text.slice(0, REPORT_COMMENT_MAX) : null;
}

/** Остаток «Внимания» — «мм:сс», как на таймере сайта. */
export function formatBoostLeft(secondsLeft: number): string {
  const safe = Math.max(0, Math.floor(secondsLeft));
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, '0')}`;
}

/**
 * Тик локального отсчёта: дёргать сервер раз в секунду ради таймера незачем.
 * Дошли до нуля — «Внимание» закончилось, так и показываем.
 */
export function tickBoost(status: UnionBoostStatus): UnionBoostStatus {
  if (!status.active) return status;
  const secondsLeft = status.secondsLeft - 1;
  if (secondsLeft > 0) return { ...status, secondsLeft };
  return { ...status, active: false, secondsLeft: 0, expiresAt: null };
}

/** Текст окна «Внимание»: что сейчас и что будет по нажатию. Без цен — их нет. */
export function boostDescription(status: UnionBoostStatus | null): string {
  if (status?.active) {
    return `«Внимание» включено. Ваша анкета показывается раньше остальных ещё ${formatBoostLeft(status.secondsLeft)}.`;
  }
  const minutes = status?.durationMinutes ?? 40;
  return `${minutes} минут ваша анкета будет показываться раньше остальных. Больше людей вас увидят и выразят симпатию.`;
}
