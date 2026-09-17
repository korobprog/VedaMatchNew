import { appVariant } from '@/config/app-variant';
import type { SessionRefreshResult } from '@/lib/api/client';
import { createAuthApi, type AuthApi } from './auth-api';
import { singleFlight } from './single-flight';
import { clearTokens, readTokens, writeTokens, type TokenPair } from './token-store';

/**
 * Единый источник правды для токенов сессии (VED-221, `feedback-001.md`,
 * блокирующий п.1). До этого модуля живой `SessionProvider` (`session.tsx`)
 * и фоновое отклонение звонка (`background-decline.ts`) держали каждый
 * свою in-memory копию пары токенов и свой собственный `singleFlight`
 * `refresh` — два независимых замыкания в одном процессе. Когда приложение
 * просто свёрнуто (не убито), `DeclineHeadlessTaskService` переиспользует
 * уже поднятый JS-движок, а не создаёт новый — оба пути оказывались в
 * одном realm, но не знали друг о друге. Ротация refresh-токена одним из
 * них делала копию другого протухшей; следующее предъявление этой копии
 * (проактивный таймер `SessionProvider`) сервер (детектор повторного
 * использования) читал как кражу и отзывал все сессии человека.
 *
 * Модуль — синглтон (`export const tokenAuthority`): оба потребителя
 * импортируют один и тот же модуль, получают одну и ту же замыкающую
 * переменную `cached` и один и тот же экземпляр `singleFlight`. Это не
 * соглашение, а гарантия рантайма ES-модулей — при условии, что оба пути
 * действительно выполняются в одном JS-процессе (для по-настоящему убитого
 * приложения headless-задача поднимает новый движок, и `cached` там снова
 * пуст — это ожидаемо, `refresh()`/`hydrate()` перечитают `SecureStore`).
 */

export interface TokenAuthorityDeps {
  authApi?: AuthApi;
}

export interface TokenAuthority {
  /** Последнее известное значение синхронно, без похода в `SecureStore` —
   *  для мест, которым нужен токен без `await` (адрес SSE-потока). `null`,
   *  пока не было ни одной `hydrate()`/`refresh()`/`adopt()`. */
  peekAccessToken(): string | null;
  /** Из памяти, если она уже наполнена; иначе один раз читает `SecureStore`. */
  getAccessToken(): Promise<string | null>;
  /** Безусловно перечитывает `SecureStore` (не только при пустом кэше) и
   *  обновляет память — без похода в сеть. Кто-то другой (в том же
   *  процессе) мог уже обновить пару, пока мы решали, что делать с 401. */
  rereadAccessToken(): Promise<string | null>;
  /** Единственный на процесс сетевой refresh — `singleFlight`: несколько
   *  одновременных вызовов делят один обмен по сети. Три различимых исхода
   *  (`SessionRefreshResult`), а не голая строка: `client.ts` должен уметь
   *  отличить «получили новый токен» от «сейчас не вышло, но сессия жива»
   *  (`gan-harness/feedback/feedback-003.md`, блокирующий п.1). */
  refresh(): Promise<SessionRefreshResult>;
  /** Вход/обмен кода/dev-login — пара уже известна, сеть не нужна. */
  adopt(tokens: TokenPair): Promise<void>;
  /** Выход/невосстановимый отказ обновления — стирает `SecureStore`. */
  drop(): Promise<void>;
  /** Один раз при старте поднимает кэш из `SecureStore`, если он пуст. */
  hydrate(): Promise<TokenPair | null>;
  /** Будит подписчика при любом `adopt`/`refresh`/`drop` — в том числе
   *  вызванном из другого места (фоновое отклонение обновило токен, пока
   *  открыт экран). */
  subscribe(listener: (tokens: TokenPair | null) => void): () => void;
}

export function createTokenAuthority(deps: TokenAuthorityDeps = {}): TokenAuthority {
  const authApi = deps.authApi ?? createAuthApi(appVariant().apiOrigin);
  let cached: TokenPair | null = null;
  let hydrated = false;
  const listeners = new Set<(tokens: TokenPair | null) => void>();

  function notify(tokens: TokenPair | null): void {
    for (const listener of listeners) listener(tokens);
  }

  async function setCached(tokens: TokenPair | null): Promise<void> {
    cached = tokens;
    hydrated = true;
    if (tokens) await writeTokens(tokens);
    else await clearTokens();
    notify(tokens);
  }

  async function hydrate(): Promise<TokenPair | null> {
    if (!hydrated) {
      cached = await readTokens();
      hydrated = true;
    }
    return cached;
  }

  async function rereadAccessToken(): Promise<string | null> {
    cached = await readTokens();
    hydrated = true;
    return cached?.accessToken ?? null;
  }

  // Один экземпляр на модуль: singleFlight делит один сетевой обмен между
  // всеми, кто позвал refresh() параллельно, откуда бы они ни звали.
  const refresh = singleFlight(async (): Promise<SessionRefreshResult> => {
    // Перечитать, а не доверять `cached`: другой вызывающий (в этом же
    // процессе) мог обновить пару в SecureStore уже после того, как этот
    // вызов встал в очередь singleFlight, но до того, как получил
    // выполнение — тогда сеть вообще не нужна.
    const before = await readTokens();
    cached = before;
    hydrated = true;
    // Пары нет вовсе (не «сеть подвела», а реально нечем обновляться) —
    // для вызывающего это неотличимо от явного отказа: сессии, которую
    // можно было бы спасти повтором, тут нет.
    if (!before) return { kind: 'rejected' };
    try {
      const fresh = await authApi.refresh(before.refreshToken);
      const pair: TokenPair = { accessToken: fresh.accessToken, refreshToken: fresh.refreshToken };
      await setCached(pair);
      return { kind: 'refreshed', accessToken: pair.accessToken };
    } catch (error) {
      const status = (error as { status?: number }).status;
      // Сервер явно ОТВЕРГ этот refresh-токен — только тогда он действительно
      // мёртв. Любой другой исход (сеть недоступна — `status === 0`, сервер
      // временно лёг — 5xx, необычный ответ) не значит того же самого: стирать
      // токены здесь означало бы разлогинивать человека из-за недоступности
      // сервера или сна телефона, а не из-за реального конца сессии
      // (`gan-harness/feedback/feedback-002.md`, важное п.2). Раньше в этом
      // случае возвращался СТАРЫЙ access-токен как если бы обновление
      // удалось — `client.ts` слепо повторял запрос тем же уже отвергнутым
      // токеном, получал второй 401 и трактовал это как конец сессии, сводя
      // защиту на нет (`feedback-003.md`, блокирующий п.1). Теперь исход
      // различим по `kind`, и `client.ts` для `'unavailable'` вообще не
      // повторяет запрос и не трогает сессию.
      if (status !== 401 && status !== 403) return { kind: 'unavailable' };
      // Отказ мог относиться к уже устаревшей паре: если SecureStore за это
      // время обновился (кто-то другой успел раньше), это не смерть сессии.
      const latest = await readTokens();
      if (latest && latest.refreshToken !== before.refreshToken) {
        cached = latest;
        return { kind: 'refreshed', accessToken: latest.accessToken };
      }
      await setCached(null);
      return { kind: 'rejected' };
    }
  });

  return {
    peekAccessToken: () => cached?.accessToken ?? null,
    getAccessToken: async () => (await hydrate())?.accessToken ?? null,
    rereadAccessToken,
    refresh,
    adopt: (tokens) => setCached(tokens),
    drop: () => setCached(null),
    hydrate,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Инстанс на процесс — то, чем реально пользуются `session.tsx` и
 *  `background-decline.ts`. */
export const tokenAuthority = createTokenAuthority();
