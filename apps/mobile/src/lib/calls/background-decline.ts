import { appVariant } from '@/config/app-variant';
import { createApiClient } from '@/lib/api/client';
import { createAuthApi } from '@/lib/auth/auth-api';
import { singleFlight } from '@/lib/auth/single-flight';
import { clearTokens, readTokens, writeTokens, type TokenPair } from '@/lib/auth/token-store';

/**
 * «Отклонить» с экрана блокировки/из шторки без открытия приложения
 * (VED-221, п.4). Срабатывает из headless JS задачи
 * (`decline-call-headless-task.ts`), которую нативный модуль
 * (`modules/vedamatch-calls`) поднимает по нажатию на действие
 * уведомления — там нет ни `SessionProvider`, ни другого React-дерева,
 * поэтому токены и обновление читаются напрямую здесь, тем же
 * хранилищем (`token-store.ts`, Android Keystore через `expo-secure-store`)
 * и тем же протоколом, что и обычная сессия (`lib/auth/session.tsx`):
 * access в `Authorization: Bearer`, при 401 — один обмен по
 * `POST /auth/app/refresh` на все параллельные вызовы (`singleFlight`,
 * как в `api/client.ts`).
 *
 * Отдельный, а не переиспользованный инстанс `SessionProvider`: у headless
 * задачи может не быть готового к этому моменту дерева React вовсе — свой,
 * независимый набор токенов и refresh делает функцию самодостаточной.
 */

export interface BackgroundDeclineDeps {
  fetchImpl?: typeof fetch;
}

export function createBackgroundDecline(deps: BackgroundDeclineDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;

  return async function declineCallInBackground(callId: string): Promise<boolean> {
    const stored = await readTokens();
    if (!stored) return false;

    const { apiOrigin } = appVariant();
    const authApi = createAuthApi(apiOrigin, fetchImpl);
    let current: TokenPair = stored;

    const refresh = singleFlight(async (): Promise<string | null> => {
      try {
        const fresh = await authApi.refresh(current.refreshToken);
        current = { accessToken: fresh.accessToken, refreshToken: fresh.refreshToken };
        await writeTokens(current);
        return current.accessToken;
      } catch (error) {
        // Сеть недоступна — токены ещё могут быть живы, пробуем со старым access.
        if ((error as { status?: number }).status === 0) return current.accessToken;
        await clearTokens();
        return null;
      }
    });

    const api = createApiClient({
      baseUrl: apiOrigin,
      fetchImpl,
      session: {
        getAccessToken: async () => current.accessToken,
        refresh,
      },
    });

    try {
      await api.request<void>(`/chat/calls/${callId}/decline`, { method: 'POST' });
      return true;
    } catch {
      // Звонок мог уже кончиться сам (пропуск по таймауту, ответ с другого
      // устройства) — POST на уже закрытый звонок сервер отклонит, это не
      // повод считать headless-задачу упавшей: рингтон там гасит отдельный
      // `call.ended`-пуш, а не ответ этого запроса.
      return false;
    }
  };
}

/** Инстанс на процесс — то, что реально вызывает headless-задача. */
export const declineCallInBackground = createBackgroundDecline();
