import type {
  NotificationPreferencesDto,
  UpdateNotificationPreferencesRequest,
} from '@vedamatch/shared';
import type { ApiClient } from '@/lib/api/client';

/**
 * Тумблеры уведомлений портала — тот же эндпоинт, что читает и пишет сайт
 * (`apps/web/src/lib/notifications-api.ts`). Приложению из них нужны два:
 * «Сообщения» и «Звонки» (VED-361), остальные остаются на сайте.
 */
export function createNotificationPreferencesApi(api: ApiClient) {
  return {
    load: () =>
      api.request<NotificationPreferencesDto>('/notifications/preferences'),
    save: (patch: UpdateNotificationPreferencesRequest) =>
      api.request<NotificationPreferencesDto>('/notifications/preferences', {
        method: 'PATCH',
        // `body` клиент сериализует сам — здесь объект, а не строка.
        body: patch,
      }),
  };
}

export type NotificationPreferencesApi = ReturnType<
  typeof createNotificationPreferencesApi
>;
