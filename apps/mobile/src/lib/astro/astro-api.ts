import type { AstroTodayDto } from '@vedamatch/shared';
import { ApiError, type ApiClient } from '@/lib/api/client';

/**
 * Астрология в приложении — только «Персональный день» (экран
 * `app/astro/today.tsx`). Ручка та же, что у сайта
 * (`apps/web/src/lib/astro-api.ts`, `getAstroToday`), новых не заводилось:
 * `GET /astro/today` под `AuthGuard`, Bearer-токен приложения он принимает
 * наравне с cookie.
 */
export function createAstroApi(api: ApiClient) {
  return {
    /**
     * Персональный день. `null` — нет точного времени и места рождения:
     * сервер отвечает 404 «Нужны точные дата, время и место рождения»
     * (`astro-transit.controller.ts`), и так же понимает его сайт
     * (`emptyOn404`). Любая другая ошибка — ошибка, её покажет экран.
     */
    async today(): Promise<AstroTodayDto | null> {
      try {
        return await api.request<AstroTodayDto>('/astro/today');
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  };
}

export type AstroApi = ReturnType<typeof createAstroApi>;
