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
import { clearTokens, readTokens, writeTokens, type TokenPair } from './token-store';
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
  const tokensRef = useRef<TokenPair | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const pendingVerifier = useRef<string | null>(null);

  const dropSession = useCallback(async () => {
    tokensRef.current = null;
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    await clearTokens();
    setUser(null);
    setStatus('guest');
  }, []);

  // Объявлено через ref, чтобы refresh и adopt могли ссылаться друг на друга
  // без лишних зависимостей хуков.
  const adoptRef = useRef<(tokens: TokenPair | AppTokens) => Promise<void>>(async () => undefined);

  const refresh = useCallback(async (): Promise<string | null> => {
    const current = tokensRef.current;
    if (!current) return null;
    try {
      const fresh = await authApi.refresh(current.refreshToken);
      await adoptRef.current(fresh);
      return fresh.accessToken;
    } catch (error) {
      // Сеть упала: токены ещё могут быть живы, сессию не трогаем.
      if ((error as { status?: number }).status === 0) return current.accessToken;
      await dropSession();
      return null;
    }
  }, [authApi, dropSession]);

  const scheduleRefresh = useCallback(
    (accessToken: string) => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      const delay = msUntilRefresh(accessToken, Date.now());
      refreshTimer.current = setTimeout(() => void refresh(), Math.max(delay, 5_000));
    },
    [refresh],
  );

  adoptRef.current = async (tokens) => {
    const pair = { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
    tokensRef.current = pair;
    await writeTokens(pair);
    scheduleRefresh(pair.accessToken);
  };

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: apiOrigin,
        session: {
          getAccessToken: async () => tokensRef.current?.accessToken ?? null,
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

  // Восстановление при запуске: токены из хранилища, профиль с сервера.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await readTokens();
      if (cancelled) return;
      if (!stored) {
        setStatus('guest');
        return;
      }
      tokensRef.current = stored;
      scheduleRefresh(stored.accessToken);
      try {
        await loadProfile();
      } catch {
        // Профиль не загрузился, а сессия не сброшена: сеть. Пускаем в
        // приложение с тем, что есть, профиль догрузится позже.
        if (tokensRef.current) setStatus('signed');
      }
    })();
    return () => {
      cancelled = true;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [loadProfile, scheduleRefresh]);

  const completeSignIn = useCallback(
    async (url: string) => {
      const verifier = pendingVerifier.current;
      if (!verifier) return;
      const parsed = parseAuthRedirect(url);
      if (parsed.kind === 'invalid') return;
      pendingVerifier.current = null;
      if (parsed.kind === 'error') throw new Error(parsed.message);
      await adoptRef.current(await authApi.exchangeCode(parsed.code, verifier));
      await loadProfile();
    },
    [authApi, loadProfile],
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
      await adoptRef.current(await authApi.devLogin(email, password));
      await loadProfile();
    },
    [authApi, loadProfile],
  );

  const getAccessToken = useCallback(() => tokensRef.current?.accessToken ?? null, []);

  const signOut = useCallback(async () => {
    const current = tokensRef.current;
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
