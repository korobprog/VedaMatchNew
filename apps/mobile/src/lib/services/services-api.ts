import type { ServiceCard } from '@vedamatch/shared';
import type { ApiClient } from '@/lib/api/client';

/**
 * Каталог сервисов портала (VED-174): один источник правды с сайтом.
 * Названия и описания правит администратор из админки — хардкодить их
 * второй раз в приложении не нужно (тот же принцип, что у `getServiceCard`
 * на вебе, `apps/web/src/lib/api.ts`). `GET /services` авторизованный и
 * учитывает этап пути и подтверждение преданного, в отличие от гостевого
 * `GET /services/public`.
 */
export function createServicesApi(api: ApiClient) {
  return {
    list: () => api.request<ServiceCard[]>('/services'),
  };
}

export type ServicesApi = ReturnType<typeof createServicesApi>;
