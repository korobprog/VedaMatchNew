import { appVariant } from '@/config/app-variant';
import { tokenAuthority, type TokenAuthority } from '@/lib/auth/token-authority';

/**
 * «Отклонить» с экрана блокировки/из шторки без открытия приложения
 * (VED-221, п.4). Срабатывает из headless JS задачи
 * (`decline-call-headless-task.ts`), которую нативный модуль
 * (`modules/vedamatch-calls`) поднимает по нажатию на действие
 * уведомления — там нет готового React-дерева, но токены читаются и
 * обновляются через тот же `tokenAuthority` (`lib/auth/token-authority.ts`),
 * которым пользуется и `session.tsx`: если приложение просто свёрнуто (не
 * убито), headless-задача выполняется в том же JS-процессе, и это буквально
 * один и тот же `singleFlight`, а не два независимых обновления одного
 * refresh-токена (`feedback-001.md`, блокирующий п.1 — второе обновление
 * тем же токеном сервер читает как кражу и отзывает все сессии).
 *
 * Порядок при 401 — сначала дёшево, потом по сети: сперва просто перечитать
 * `SecureStore` (`rereadAccessToken`, без похода в сеть) — кто-то другой в
 * этом же процессе мог уже обновиться; сетевой `refresh()` только если
 * перечитанный токен тот же, что уже не сработал.
 */

export interface BackgroundDeclineDeps {
  fetchImpl?: typeof fetch;
  tokenAuthority?: TokenAuthority;
}

export function createBackgroundDecline(deps: BackgroundDeclineDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const authority = deps.tokenAuthority ?? tokenAuthority;

  return async function declineCallInBackground(callId: string): Promise<boolean> {
    const { apiOrigin } = appVariant();
    const url = `${apiOrigin.replace(/\/+$/, '')}/chat/calls/${callId}/decline`;

    const post = (token: string) =>
      fetchImpl(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });

    let token = await authority.getAccessToken();
    if (!token) return false;

    try {
      let response = await post(token);
      if (response.status === 401) {
        const reread = await authority.rereadAccessToken();
        token = reread && reread !== token ? reread : await authority.refresh();
        if (!token) return false;
        response = await post(token);
      }
      return response.ok;
    } catch {
      // Сеть/звонок мог уже кончиться сам (пропуск по таймауту, ответ с
      // другого устройства) — POST на уже закрытый звонок сервер отклонит,
      // это не повод считать headless-задачу упавшей: рингтон там гасит
      // отдельный `call.ended`-пуш, а не ответ этого запроса.
      return false;
    }
  };
}

/** Инстанс на процесс — то, что реально вызывает headless-задача. */
export const declineCallInBackground = createBackgroundDecline();
