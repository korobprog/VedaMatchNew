import type { ChatCallEndReason } from '@vedamatch/shared';
import { appVariant } from '@/config/app-variant';
import { tokenAuthority, type TokenAuthority } from '@/lib/auth/token-authority';

/**
 * Действие со звонком из фона, без живого React-дерева и часто без живой
 * `Activity` (VED-221 п.4, VED-222 п.1 — второе обобщает первое по итогам
 * `feedback-001.md`, блокирующий п.2). Общий контракт для обоих headless-путей:
 *
 * - «Отклонить» с экрана блокировки/из шторки — `decline-call-headless-task.ts`,
 *   поднимается `DeclineHeadlessTaskService.kt` по нажатию кнопки уведомления;
 * - «Завершить» из `CallForegroundService.onTaskRemoved()` (смахнули
 *   приложение из списка последних задач во время разговора) —
 *   `hangup-call-headless-task.ts`, поднимается `HangupHeadlessTaskService.kt`.
 *   До этой правки `onTaskRemoved` полагался на `NativeEventEmitter`
 *   (`sendEndEvent` → JS `onEnd` → `hangUp()` → `callsApi.end(...)`) — ровно
 *   тот путь, где JS-мост с наибольшей вероятностью уже не отвечает (Activity
 *   разрушается), а не самый надёжный. Здесь — тот же паттерн, что уже
 *   доказал себя для «Отклонить»: `HeadlessJsTaskService` с собственным
 *   wake lock, независимый от состояния Activity/React-дерева.
 *
 * Оба пути делят один и тот же протокол токенов — `tokenAuthority`
 * (`lib/auth/token-authority.ts`), тот же синглтон, которым пользуется живой
 * `session.tsx`: если приложение просто свёрнуто (не убито), headless-задача
 * выполняется в том же JS-процессе, и это буквально один `singleFlight`, а не
 * два независимых обновления одного refresh-токена (`feedback-001.md` этапа
 * 2, блокирующий п.1 — второе обновление тем же токеном сервер читает как
 * кражу и отзывает все сессии).
 *
 * Порядок при 401 — сначала дёшево, потом по сети: сперва просто перечитать
 * `SecureStore` (`rereadAccessToken`, без похода в сеть) — кто-то другой в
 * этом же процессе мог уже обновиться; сетевой `refresh()` только если
 * перечитанный токен тот же, что уже не сработал.
 */

export type BackgroundCallAction = 'decline' | 'end';

export interface BackgroundCallActionDeps {
  fetchImpl?: typeof fetch;
  tokenAuthority?: TokenAuthority;
}

function urlFor(action: BackgroundCallAction, callId: string): string {
  const { apiOrigin } = appVariant();
  const path = action === 'decline' ? 'decline' : 'end';
  return `${apiOrigin.replace(/\/+$/, '')}/chat/calls/${callId}/${path}`;
}

/** `decline` не принимает тело (см. `docs/mobile-calls-native.md` §12.8 —
 *  известное ограничение контракта API, не этого клиента); `end` — тело
 *  `EndChatCallRequest`, `reason` по умолчанию `'hangup'` (обычное
 *  завершение, тот же дефолт, что у кнопки «Завершить» внутри приложения,
 *  `call-provider.tsx`, `hangUpWith('hangup')`). */
function bodyFor(action: BackgroundCallAction, reason?: ChatCallEndReason): BodyInit | undefined {
  if (action === 'decline') return undefined;
  return JSON.stringify({ reason: reason ?? 'hangup' });
}

export function createBackgroundCallAction(deps: BackgroundCallActionDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const authority = deps.tokenAuthority ?? tokenAuthority;

  return async function callActionInBackground(
    callId: string,
    action: BackgroundCallAction,
    reason?: ChatCallEndReason,
  ): Promise<boolean> {
    const url = urlFor(action, callId);
    const body = bodyFor(action, reason);

    const post = (token: string) =>
      fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body,
      });

    let token = await authority.getAccessToken();
    if (!token) return false;

    try {
      let response = await post(token);
      if (response.status === 401) {
        const reread = await authority.rereadAccessToken();
        if (reread && reread !== token) {
          token = reread;
        } else {
          const result = await authority.refresh();
          // 'rejected' — сессия действительно кончилась (уже стёрта внутри
          // refresh()). 'unavailable' — сеть/сервер сейчас недоступны, но
          // токены НЕ тронуты (`token-authority.ts`) — в обоих случаях
          // здесь просто нечем повторить запрос сейчас, не наше дело их
          // стирать самим (`feedback-003.md` этапа 2, п.4).
          if (result.kind !== 'refreshed') return false;
          token = result.accessToken;
        }
        response = await post(token);
      }
      return response.ok;
    } catch {
      // Сеть/звонок мог уже кончиться сам (пропуск по таймауту, ответ с
      // другого устройства, обычный hangUp успел уйти раньше нас) — POST на
      // уже закрытый звонок сервер отклонит, это не повод считать
      // headless-задачу упавшей.
      return false;
    }
  };
}

/** Инстанс на процесс — то, что реально вызывают headless-задачи. */
export const backgroundCallAction = createBackgroundCallAction();

/** Тонкие обёртки под конкретное действие — читаемее в месте вызова, чем
 *  голый `backgroundCallAction(id, 'end', 'hangup')`. */
export function declineCallInBackground(callId: string): Promise<boolean> {
  return backgroundCallAction(callId, 'decline');
}

export function hangupCallInBackground(callId: string): Promise<boolean> {
  return backgroundCallAction(callId, 'end', 'hangup');
}
