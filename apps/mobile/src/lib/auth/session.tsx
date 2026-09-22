import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { appVariant } from '@/config/app-variant';
import { createApiClient, type ApiClient, type SessionRefreshResult } from '@/lib/api/client';
import { createAuthApi, type AppTokens } from './auth-api';
import { toSessionUser, type ProfileResponse, type SessionUser } from './session-user';
import { msUntilRefresh } from './jwt-expiry';
import { buildLoginUrl, parseAuthRedirect, APP_AUTH_REDIRECT, type LoginProvider } from './login-flow';
import { createPkcePair } from './pkce';
import { nextRefreshBackoffMs } from './refresh-backoff';
import { reactToTokenChange } from './session-token-reaction';
import { tokenAuthority } from './token-authority';
import type { TokenPair } from './token-store';
import { unregisterDevice } from '@/lib/push/push-api';

/**
 * Сессия приложения: токены в защищённом хранилище, обновление access-токена
 * заранее и один API-клиент на всё приложение.
 *
 * Вход идёт через системный браузер: API возвращает одноразовый код на
 * `vedamatch://auth`, приложение меняет его на токены с PKCE-верификатором.
 */

/** Сам тип живёт в `session-user.ts` — туда он переехал в VED-333, чтобы обе
 *  веб-сессии и сессия на токенах складывали пользователя одной функцией.
 *  Имя по-прежнему импортируют отсюда. */
export type { SessionUser };

export type SessionStatus = 'loading' | 'guest' | 'signed';

export interface Session {
  status: SessionStatus;
  user: SessionUser | null;
  api: ApiClient;
  /** Адрес API варианта сборки: нужен потоку событий, который ходит мимо клиента. */
  apiOrigin: string;
  /**
   * Сессия в httpOnly cookie портала (веб-версия, `session.web.tsx`): токена
   * в JS нет, и поток событий ходит с cookie, а не с заголовком.
   */
  cookieSession: boolean;
  /**
   * Почему не удался вход без экрана входа (мини-приложение Telegram) —
   * экран входа показывает это вместо молчаливой пустой формы.
   */
  loginError: string | null;
  /** Текущий access-токен для запросов вне ApiClient (поток событий). */
  getAccessToken(): string | null;
  /** Обновить access-токен — три различимых исхода, см. `SessionRefreshResult`. */
  refreshAccessToken(): Promise<SessionRefreshResult>;
  signIn(provider: LoginProvider): Promise<void>;
  /**
   * Завершение входа по адресу возврата `vedamatch://auth?...`. Android
   * иногда отдаёт его не в openAuthSessionAsync, а как переход по ссылке;
   * тогда его ловит маршрут `auth`. Повторный вызов с тем же адресом
   * ничего не делает: верификатор одноразовый.
   */
  completeSignIn(url: string): Promise<void>;
  signInDev(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /**
   * Регистрирует колбэк, который `signOut()` дождётся (best-effort, с общим
   * таймаутом на все колбэки) ДО того, как снять push-токен и отозвать
   * сессию — единственный способ для другого модуля (звонков,
   * `call-provider.tsx`/`session-call-guard.ts`) сделать сетевой запрос с
   * ещё живым access-токеном на явном выходе из аккаунта, а не только
   * прибраться локально уже ПОСЛЕ того, как `status` сменился на `'guest'`
   * и токенов больше нет (`gan-harness/feedback/feedback-002.md`, блокирующий
   * п.1). Сама сессия ничего не знает про звонки — это общий, не
   * специфичный для них механизм; несколько регистраций складываются,
   * отписка — возвращаемой функцией.
   */
  registerBeforeSignOut(hook: () => Promise<void>): () => void;
  /**
   * Перечитать `GET /users/me` и обновить `user` (VED-332). Нужен экрану
   * профиля: после смены имени или фотографии стоявшее в сессии значение
   * протухает, и «Аккаунт», справочник и шапки продолжали бы показывать
   * старое имя до перезапуска приложения.
   */
  reloadUser(): Promise<void>;
}

/** Сколько максимум ждать все `registerBeforeSignOut`-колбэки в сумме,
 *  прежде чем всё равно продолжить выход — «best-effort», а не гарантия
 *  доставки: сеть может быть недоступна, и разлогин не должен зависеть от
 *  чужого HTTP-запроса дольше разумного. */
const BEFORE_SIGN_OUT_TIMEOUT_MS = 2000;

const SessionContext = createContext<Session | null>(null);

const pkceCrypto = {
  randomBytes: (length: number) => Crypto.getRandomBytes(length),
  sha256Base64: (input: string) =>
    Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input, {
      encoding: Crypto.CryptoEncoding.BASE64,
    }),
};


export function SessionProvider({ children }: { children: ReactNode }) {
  const { apiOrigin } = appVariant();
  const authApi = useMemo(() => createAuthApi(apiOrigin), [apiOrigin]);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const pendingVerifier = useRef<string | null>(null);
  const beforeSignOutHooks = useRef<Set<() => Promise<void>>>(new Set());

  const registerBeforeSignOut = useCallback((hook: () => Promise<void>) => {
    beforeSignOutHooks.current.add(hook);
    return () => {
      beforeSignOutHooks.current.delete(hook);
    };
  }, []);

  // Актуальный статус для колбэков вне цикла рендера (подписка на
  // `tokenAuthority` ниже) — не значение из замыкания рендера, которое
  // регистрировалось один раз (`gan-harness/feedback/feedback-002.md`,
  // блокирующий п.1: `scheduleRefresh` стабилен на весь процесс →
  // `useEffect([scheduleRefresh])` выполняется один раз при монтировании →
  // колбэк внутри навсегда помнил бы `status`, каким он был на первом
  // рендере). Обновляется синхронно с `setStatus` в отдельном эффекте
  // ниже — React гарантированно прогоняет эффекты после каждого коммита.
  const statusRef = useRef<SessionStatus>(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Токены и их обновление — не здесь: `tokenAuthority`
  // (`token-authority.ts`) один на процесс, его же использует фоновое
  // отклонение звонка (`background-call-action.ts`). Раньше у `SessionProvider`
  // была своя копия токенов и свой `singleFlight refresh`, независимый от
  // headless-задачи — когда приложение было просто свёрнуто (не убито), обе
  // ветки жили в одном JS-движке, но не знали друг о друге; ротация
  // refresh-токена одной из них делала копию другой протухшей, и её
  // следующее предъявление сервер (детектор повторного использования)
  // читал как кражу и отзывал все сессии человека
  // (`gan-harness/feedback/feedback-001.md`, блокирующий п.1).
  const refresh = tokenAuthority.refresh;

  // Сколько подряд проактивных refresh() отработали 'unavailable' (сеть/5xx,
  // не явный отказ) — растущая пауза между повторами читает этот счётчик
  // (`refresh-backoff.ts`). Без этого таймер был бы одноразовым: после
  // первой неудачи проактивная сторона молчала бы до следующего явного
  // триггера, которым на практике оказывался бы обычный запрос через
  // `client.ts` — тот теперь и сам не трогает сессию на `'unavailable'`
  // (`gan-harness/feedback/feedback-003.md`, блокирующий п.1-2), но без
  // повторных попыток проактивная сторона так и не восстановилась бы сама.
  const backoffAttempt = useRef(0);

  const dropSession = useCallback(async () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    backoffAttempt.current = 0;
    await tokenAuthority.drop();
    setUser(null);
    setStatus('guest');
  }, []);

  /** Тело и обычного проактивного обновления (по истечении access), и
   *  повторной попытки после `'unavailable'` — один и тот же таймер
   *  `refreshTimer`, одна и та же функция. `'refreshed'`/`'rejected'` уже
   *  прошли через `setCached()` → `notify()` → подписку ниже, которая сама
   *  перепланирует обычный таймер (`reschedule`/`mark-signed`) или
   *  остановит всё (`mark-guest`) — здесь для них делать больше нечего. */
  const runProactiveRefresh = useCallback(async () => {
    const result = await tokenAuthority.refresh();
    if (result.kind === 'unavailable') {
      const delay = nextRefreshBackoffMs(backoffAttempt.current);
      backoffAttempt.current += 1;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => void runProactiveRefresh(), delay);
    } else {
      backoffAttempt.current = 0;
    }
  }, []);

  const scheduleRefresh = useCallback(
    (accessToken: string) => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      backoffAttempt.current = 0;
      const delay = msUntilRefresh(accessToken, Date.now());
      refreshTimer.current = setTimeout(() => void runProactiveRefresh(), Math.max(delay, 5_000));
    },
    [runProactiveRefresh],
  );

  // Пока в цикле бэкоффа (`'unavailable'` уже случался и ждём следующей
  // попытки) — возврат в передний план не должен ждать оставшуюся паузу,
  // сеть могла уже вернуться; уход в фон, наоборот, останавливает таймер —
  // незачем жечь батарею повторами, которых никто не увидит, следующий
  // возврат в foreground или явный запрос попробуют снова.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        if (backoffAttempt.current > 0) {
          if (refreshTimer.current) clearTimeout(refreshTimer.current);
          void runProactiveRefresh();
        }
      } else if (next === 'background' && backoffAttempt.current > 0 && refreshTimer.current) {
        clearTimeout(refreshTimer.current);
        refreshTimer.current = null;
      }
    });
    return () => subscription.remove();
  }, [runProactiveRefresh]);

  const adopt = useCallback(async (tokens: TokenPair | AppTokens) => {
    const pair = { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
    // `tokenAuthority.adopt` уведомляет подписчиков синхронно (`setCached`
    // → `notify`) — тот же `SessionProvider` подписан ниже и сам
    // перепланирует таймер через `reactToTokenChange(...) === 'reschedule'`
    // (или `'mark-signed'`, если раньше был гостем). Второй явный вызов
    // `scheduleRefresh` здесь был бы избыточным дублем одной и той же
    // работы (`feedback-002.md`, non-blocking п.2).
    await tokenAuthority.adopt(pair);
  }, []);

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: apiOrigin,
        session: {
          getAccessToken: async () => tokenAuthority.getAccessToken(),
          refresh,
        },
        onSessionExpired: () => void dropSession(),
      }),
    [apiOrigin, refresh, dropSession],
  );

  const loadProfile = useCallback(async () => {
    const profile = await api.request<ProfileResponse>('/users/me');
    setUser(toSessionUser(profile));
    setStatus('signed');
  }, [api]);

  // Восстановление при запуске: токены из хранилища (через `tokenAuthority`
  // — если фоновая задача уже что-то туда писала до первого рендера
  // приложения, подхватится оно), профиль с сервера.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await tokenAuthority.hydrate();
      if (cancelled) return;
      if (!stored) {
        setStatus('guest');
        return;
      }
      scheduleRefresh(stored.accessToken);
      try {
        await loadProfile();
      } catch {
        // Профиль не загрузился, а сессия не сброшена: сеть. Пускаем в
        // приложение с тем, что есть, профиль догрузится позже.
        if (tokenAuthority.peekAccessToken()) setStatus('signed');
      }
    })();
    return () => {
      cancelled = true;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [loadProfile, scheduleRefresh]);

  // Токены могли обновиться не отсюда — фоновое отклонение звонка (тот же
  // `tokenAuthority` в том же процессе). Подписка регистрируется один раз
  // (`scheduleRefresh` стабилен на весь процесс — `refresh` не меняет
  // идентичность), поэтому решение «что делать» читает `statusRef.current`
  // (актуальный на момент СОБЫТИЯ, а не на момент регистрации подписки),
  // а не сам `status` из замыкания — иначе эффект с зависимостью
  // `[scheduleRefresh]` захватил бы `status`, какой он был при
  // монтировании, навсегда (`feedback-002.md`, блокирующий п.1: без этого
  // `SessionProvider` мог остаться в `'signed'` даже после того, как
  // сессия на самом деле умерла в фоне — UI выглядел бы вошедшим, но
  // ничего не работало бы). Никакого `eslint-disable`: все использованные
  // здесь значения либо стабильны (`scheduleRefresh`, `tokenAuthority`),
  // либо читаются через `ref` — оба варианта exhaustive-deps устраивают
  // без подавления.
  useEffect(() => {
    return tokenAuthority.subscribe((tokens) => {
      const reaction = reactToTokenChange(statusRef.current, Boolean(tokens));
      switch (reaction) {
        case 'ignore':
          return;
        case 'reschedule':
          scheduleRefresh(tokens!.accessToken);
          return;
        case 'mark-signed':
          scheduleRefresh(tokens!.accessToken);
          setStatus('signed');
          return;
        case 'mark-guest':
          if (refreshTimer.current) clearTimeout(refreshTimer.current);
          backoffAttempt.current = 0;
          setUser(null);
          setStatus('guest');
          return;
      }
    });
  }, [scheduleRefresh]);

  const completeSignIn = useCallback(
    async (url: string) => {
      const verifier = pendingVerifier.current;
      if (!verifier) return;
      const parsed = parseAuthRedirect(url);
      if (parsed.kind === 'invalid') return;
      pendingVerifier.current = null;
      if (parsed.kind === 'error') throw new Error(parsed.message);
      await adopt(await authApi.exchangeCode(parsed.code, verifier));
      await loadProfile();
    },
    [authApi, adopt, loadProfile],
  );

  const signIn = useCallback(
    async (provider: LoginProvider) => {
      const pkce = await createPkcePair(pkceCrypto);
      pendingVerifier.current = pkce.verifier;
      const result = await WebBrowser.openAuthSessionAsync(
        buildLoginUrl(apiOrigin, provider, pkce.challenge),
        APP_AUTH_REDIRECT,
      );
      if (result.type === 'success') await completeSignIn(result.url);
    },
    [apiOrigin, completeSignIn],
  );

  const signInDev = useCallback(
    async (email: string, password: string) => {
      await adopt(await authApi.devLogin(email, password));
      await loadProfile();
    },
    [authApi, adopt, loadProfile],
  );

  const getAccessToken = useCallback(() => tokenAuthority.peekAccessToken(), []);

  const signOut = useCallback(async () => {
    // Порядок важен (`gan-harness/feedback/feedback-002.md`, блокирующий
    // п.1): сначала — то, что зависит от ещё живого access-токена (для
    // звонков это единственный шанс успеть POST /chat/calls/:id/end, пока
    // токен не отозван), потом снимаем push-токен, и только в конце —
    // logout на сервере/`dropSession()`, после которого токенов уже нет.
    await Promise.race([
      Promise.allSettled([...beforeSignOutHooks.current].map((hook) => hook())),
      new Promise<void>((resolve) => setTimeout(resolve, BEFORE_SIGN_OUT_TIMEOUT_MS)),
    ]);
    const current = await tokenAuthority.hydrate();
    // Телефон снимаем до выхода: после него у запроса уже не будет токена.
    await unregisterDevice(api);
    if (current) authApi.logout(current.refreshToken).catch(() => undefined);
    await dropSession();
  }, [api, authApi, dropSession]);

  const value = useMemo<Session>(
    () => ({
      status,
      user,
      api,
      apiOrigin,
      cookieSession: false,
      loginError: null,
      getAccessToken,
      refreshAccessToken: refresh,
      signIn,
      completeSignIn,
      signInDev,
      signOut,
      registerBeforeSignOut,
      reloadUser: loadProfile,
    }),
    [
      status,
      user,
      api,
      apiOrigin,
      getAccessToken,
      refresh,
      signIn,
      completeSignIn,
      signInDev,
      signOut,
      registerBeforeSignOut,
      loadProfile,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession вне SessionProvider');
  return session;
}
