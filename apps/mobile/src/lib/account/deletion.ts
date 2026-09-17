/**
 * Раздел «Удаление аккаунта» на экране `account.tsx` — чистые помощники без
 * разметки, зеркало веба (`apps/web/src/components/delete-account-section.tsx`).
 * Эндпоинты те же самостоятельные `/profile/delete-request` (см.
 * `apps/api/src/modules/users/profile.controller.ts`) — отдельного
 * `/users/me/deletion` не заводим: `GET /users/me` уже отдаёт
 * `pendingDeletionAt`/`deletionEligibleAt` в составе профиля, а заводить
 * второй источник состояния того же поля значило бы разойтись с вебом.
 */

/** Ровно те поля `UserProfile` (`@vedamatch/shared`), что нужны разделу. */
export interface DeletionStatus {
  pendingDeletionAt: string | null;
  deletionEligibleAt: string | null;
}

/** Назначено ли удаление — есть что показывать вместо кнопки «Удалить». */
export function isDeletionScheduled(
  status: Pick<DeletionStatus, 'pendingDeletionAt'>,
): boolean {
  return status.pendingDeletionAt != null;
}

/** Дата удаления по-русски для карточки «Аккаунт будет удалён …». */
export function formatDeletionDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
