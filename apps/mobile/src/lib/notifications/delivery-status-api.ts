import type { NotificationDeliveryStatusDto } from '@vedamatch/shared';
import type { ApiClient } from '@/lib/api/client';

/**
 * «Есть ли куда доставлять уведомления» (VED-314 на сервере, VED-329 здесь).
 * Тот же эндпоинт, что читает сайт, — раздел доставки на экране «Аккаунт»
 * показывает по нему честное состояние вместо молчания.
 */
export function createDeliveryStatusApi(api: ApiClient) {
  return {
    status: () =>
      api.request<NotificationDeliveryStatusDto>('/notifications/delivery-status'),
  };
}

export type DeliveryStatusApi = ReturnType<typeof createDeliveryStatusApi>;
