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
import { appVariant } from '@/config/app-variant';
import { createApiClient, type ApiClient } from '@/lib/api/client';
import { createAuthApi, type AppTokens } from './auth-api';
import { msUntilRefresh } from './jwt-expiry';
import { buildLoginUrl, parseAuthRedirect, APP_AUTH_REDIRECT, type LoginProvider } from './login-flow';
import { createPkcePair } from './pkce';
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

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export type SessionStatus = 'loading' | 'guest' | 'signed';

export interface Session {
  status: SessionStatus;
  user: SessionUser | null;
  api: ApiClient;
  /** Адрес API варианта сборки: нужен потоку событий, который ходит мимо клиента. */
  apiOrigin: string;
  /** Текущий access-токен для запросов вне ApiClient (поток событий). */
  getAccessToken(): string | null;
  /** Обновить access-токен; `null`, если сессия закончилась. */
  refreshAccessToken(): Promise<string | null>;
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
}

const SessionContext = createContext<Session | null>(null);

const pkceCrypto = {
  randomBytes: (length: number) => Crypto.getRandomBytes(length),
  sha256Base64: (input: string) =>
    Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input, {
      encoding: Crypto.CryptoEncoding.BASE64,
    }),
};

interface ProfileResponse {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const { apiOrigin } = appVariant();
  const authApi = useMemo(() => createAuthApi(apiOrigin), [apiOrigin]);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const pendingVerifier = useRef<string | null>(null);

  // Токены и их обновление — не здесь: `tokenAuthority`
  // (`token-authority.ts`) один на процесс, его же использует фоновое
  // отклонение звонка (`background-decline.ts`). Раньше у `SessionProvider`
  // была своя копия токенов и свой `singleFlight refresh`, независимый от
  // headless-задачи — когда приложение было просто свёрнуто (не убито), обе
  // ветки жили в одном JS-движке, но не знали друг о друге; ротация
  // refresh-токена одной из них делала копию другой протухшей, и её
  // следующее предъявление сервер (детектор повторного использования)
  // читал как кражу и отзывал все сессии человека
  // (`gan-harness/feedback/feedback-001.md`, блокирующий п.1).
  const refresh = tokenAuthority.refresh;

  const dropSession = useCallback(async () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    await tokenAuthority.drop();
    setUser(null);
    setStatus('guest');
  }, []);

  const scheduleRefresh = useCallback(
    (accessToken: string) => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      const delay = msUntilRefresh(accessToken, Date.now());
      refreshTimer.current = setTimeout(() => void refresh(), Math.max(delay, 5_000));
    },
    [refresh],
  );

  const adopt = useCallback(
    async (tokens: TokenPair | AppTokens) => {
      const pair = { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
      await tokenAuthority.adopt(pair);
      scheduleRefresh(pair.accessToken);
    },
    [scheduleRefresh],
  );

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
    setUser({
      id: profile.id,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.avatarUrl ?? null,
    });
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

  // Токены могли обновиться не отсюда — фоновое отклонение звонка
  // (тот же `tokenAuthority` в том же процессе). Держим таймер и, если
  // сессию извне признали мёртвой (`drop()`), UI в согласии с этим —
  // без этого слушателя `SessionProvider` узнал бы о разлогине только на
  // следующем собственном запросе/таймере.
  useEffect(() => {
    return tokenAuthority.subscribe((tokens) => {
      if (tokens) scheduleRefresh(tokens.accessToken);
      else if (status !== 'loading') {
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        setUser(null);
        setStatus('guest');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      getAccessToken,
      refreshAccessToken: refresh,
      signIn,
      completeSignIn,
      signInDev,
      signOut,
    }),
    [status, user, api, apiOrigin, getAccessToken, refresh, signIn, completeSignIn, signInDev, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession вне SessionProvider');
  return session;
}
