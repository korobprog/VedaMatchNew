import type { ApiClient } from '@/lib/api/client';
import type { DeletionStatus } from './deletion';

/**
 * Клиент раздела «Удаление аккаунта» — те же маршруты, что у веба
 * (`apps/web/src/components/delete-account-section.tsx`). `status()` читает
 * поля удаления из общего профиля: они уже приходят в `GET /users/me`
 * (`UserProfile` из `@vedamatch/shared`), заводить отдельный эндпоинт под
 * два поля незачем.
 */
export function createAccountDeletionApi(api: ApiClient) {
  return {
    status: () => api.request<DeletionStatus>('/users/me'),
    request: () =>
      api.request<DeletionStatus>('/profile/delete-request', { method: 'POST' }),
    cancel: () =>
      api.request<DeletionStatus>('/profile/delete-request', { method: 'DELETE' }),
  };
}

export type AccountDeletionApi = ReturnType<typeof createAccountDeletionApi>;
