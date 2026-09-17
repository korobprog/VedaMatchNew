import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { appVariant } from '@/config/app-variant';
import { ApiError, createApiClient } from '@/lib/api/client';
import { buildWebLoginUrl, createCookieAuthApi } from './cookie-session';
import type { LoginProvider } from './login-flow';
import { hasSessionMarker } from './session-marker';
import type { Session, SessionStatus, SessionUser } from './session';

/**
 * Сессия веб-версии приложения (`ios.vedamatch.com`). Тот же интерфейс, что
 * у нативной (`session.tsx`), но токены живут в httpOnly cookie портала, а не
 * в JS: вход — переход на `/auth/<провайдер>` с возвратом сюда, обновление —
 * `POST /auth/refresh`, выход — `POST /auth/logout`. Вошёл на vedamatch.com —
 * вошёл и здесь.
 */

export type { Session, SessionStatus, SessionUser };

const BEFORE_SIGN_OUT_TIMEOUT_MS = 2000;

const SessionContext = createContext<Session | null>(null);

interface ProfileResponse {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
}

function currentPath(): string {
  const { pathname, search } = window.location;
  return pathname === '/login' ? '/' : `${pathname}${search}`;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const { apiOrigin } = appVariant();
  const authApi = useMemo(() => createCookieAuthApi(apiOrigin), [apiOrigin]);
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const beforeSignOutHooks = useRef<Set<() => Promise<void>>>(new Set());

  const registerBeforeSignOut = useCallback((hook: () => Promise<void>) => {
    beforeSignOutHooks.current.add(hook);
    return () => {
      beforeSignOutHooks.current.delete(hook);
    };
  }, []);

  const dropSession = useCallback(() => {
    setUser(null);
    setStatus('guest');
  }, []);

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: apiOrigin,
        cookieSession: true,
        session: { getAccessToken: async () => null, refresh: authApi.refresh },
        onSessionExpired: dropSession,
      }),
    [apiOrigin, authApi, dropSession],
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

  useEffect(() => {
    // Маркера нет — сессии нет наверняка: экран входа сразу, без запроса.
    if (!hasSessionMarker(document.cookie)) {
      setStatus('guest');
      return;
    }
    loadProfile().catch((error: unknown) => {
      // 401 — сессии нет. Всё прочее (сеть, 5xx на выкладке, 429) — не повод
      // ни выкидывать, ни висеть на загрузке: маркер говорит, что сессия
      // была, экраны перезапросят своё.
      if (error instanceof ApiError && error.status === 401) dropSession();
      else setStatus('signed');
    });
  }, [loadProfile, dropSession]);

  const signIn = useCallback(
    async (provider: LoginProvider) => {
      window.location.assign(buildWebLoginUrl(apiOrigin, provider, window.location.origin, currentPath()));
    },
    [apiOrigin],
  );

  // Возврата через vedamatch://auth у веб-версии нет: сервер сам ставит cookie
  // и возвращает на страницу.
  const completeSignIn = useCallback(async () => undefined, []);

  const signInDev = useCallback(
    async (email: string, password: string) => {
      await authApi.devLogin(email, password);
      await loadProfile();
    },
    [authApi, loadProfile],
  );

  const signOut = useCallback(async () => {
    await Promise.race([
      Promise.allSettled([...beforeSignOutHooks.current].map((hook) => hook())),
      new Promise<void>((resolve) => setTimeout(resolve, BEFORE_SIGN_OUT_TIMEOUT_MS)),
    ]);
    await authApi.logout();
    dropSession();
  }, [authApi, dropSession]);

  const getAccessToken = useCallback(() => null, []);

  const value = useMemo<Session>(
    () => ({
      status,
      user,
      api,
      apiOrigin,
      cookieSession: true,
      getAccessToken,
      refreshAccessToken: authApi.refresh,
      signIn,
      completeSignIn,
      signInDev,
      signOut,
      registerBeforeSignOut,
    }),
    [status, user, api, apiOrigin, getAccessToken, authApi, signIn, completeSignIn, signInDev, signOut, registerBeforeSignOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession вне SessionProvider');
  return session;
}
