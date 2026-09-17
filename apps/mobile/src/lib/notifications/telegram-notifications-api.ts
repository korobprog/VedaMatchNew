import type { ApiClient } from '@/lib/api/client';
import type {
  EnableTelegramNotificationsRequest,
  TelegramNotificationStatusResponse,
  UpdateTelegramNotificationStatusRequest,
} from '@vedamatch/shared';

/**
 * «Уведомления в Telegram» на экране «Аккаунт» (веха 4): статус, тумблер и
 * подтверждение доступа после `WebApp.requestWriteAccess()`.
 */
export function createTelegramNotificationsApi(api: ApiClient) {
  return {
    status: () =>
      api.request<TelegramNotificationStatusResponse>('/notifications/telegram'),
    setEnabled: (enabled: boolean) =>
      api.request<TelegramNotificationStatusResponse>('/notifications/telegram', {
        method: 'PUT',
        body: { enabled } satisfies UpdateTelegramNotificationStatusRequest,
      }),
    /** `initData` — те же подписанные данные запуска, что у входа/привязки,
     *  только здесь они подтверждают явное «да» на запрос доступа. */
    enable: (initData: string) =>
      api.request<TelegramNotificationStatusResponse>('/notifications/telegram/enable', {
        method: 'POST',
        body: { initData } satisfies EnableTelegramNotificationsRequest,
      }),
  };
}

export type TelegramNotificationsApi = ReturnType<typeof createTelegramNotificationsApi>;
