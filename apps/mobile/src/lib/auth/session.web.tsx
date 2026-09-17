import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { appVariant } from '@/config/app-variant';
import { ApiError, createApiClient } from '@/lib/api/client';
import { createAuthApi } from './auth-api';
import { buildWebLoginUrl, createCookieAuthApi } from './cookie-session';
import type { LoginProvider } from './login-flow';
import { msUntilRefresh } from './jwt-expiry';
import { nextRefreshBackoffMs } from './refresh-backoff';
import { reactToTokenChange } from './session-token-reaction';
import { hasSessionMarker } from './session-marker';
import { resolveWebSessionStrategy } from './telegram-web-session-strategy';
import { tokenAuthority } from './token-authority';
import { telegramLaunch } from '@/lib/telegram/web-app';
import type { Session, SessionStatus, SessionUser } from './session';

/**
 * Сессия веб-версии приложения (`ios.vedamatch.com`). Какую именно сессию
 * использовать — решает `resolveWebSessionStrategy` один раз при монтировании
 * (`telegramLaunch` сам вычисляется один раз при загрузке бандла, см.
 * `telegram/launch.ts`):
 *
 * - `cookie` (обычный браузер) — `CookieSessionProvider`: пара токенов в
 *   httpOnly cookie портала, вход/выход/обновление маршрутами сайта. Тот же
 *   интерфейс `Session`, что у нативной сборки (`session.tsx`), но токена в JS
 *   нет. Вошёл на vedamatch.com — вошёл и здесь.
 * - `telegram-token` (открыто внутри Telegram) — `TelegramTokenSessionProvider`:
 *   вместо cookie — пара токенов в памяти процесса, тем же путём, что у
 *   Android (`token-authority.ts`, `POST /auth/app/refresh|logout`). Нужен
 *   Telegram Desktop и web.telegram.org: там мини-приложение живёт в
 *   `<iframe>` на чужом происхождении, и cookie портала как третьесторонняя
 *   браузером режется — человек видел экран входа вместо своих чатов, хотя
 *   был вошёл на портале.
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

function CookieSessionProvider({ apiOrigin, children }: { apiOrigin: string; children: ReactNode }) {
  const authApi = useMemo(() => createCookieAuthApi(apiOrigin), [apiOrigin]);
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
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
    const signedBefore = hasSessionMarker(document.cookie);
    // Маркера нет — сессии нет наверняка: экран входа сразу, без запроса.
    if (!signedBefore) {
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
      loginError,
      getAccessToken,
      refreshAccessToken: authApi.refresh,
      signIn,
      completeSignIn,
      signInDev,
      signOut,
      registerBeforeSignOut,
    }),
    [
      status,
      user,
      loginError,
      api,
      apiOrigin,
      getAccessToken,
      authApi,
      signIn,
      completeSignIn,
      signInDev,
      signOut,
      registerBeforeSignOut,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/**
 * Сессия внутри Telegram: токены вместо cookie, тем же путём, что у Android
 * (`token-authority.ts` поверх `POST /auth/app/refresh|logout`). Токены живут
 * только в памяти процесса — `tokenAuthority` на вебе пишет через
 * `token-store.web.ts`, который на диск/`localStorage`/`sessionStorage`
 * ничего не кладёт: мини-приложение выполняет чужой код с telegram.org
 * (`telegram-web-app.js`), и постоянное хранилище было бы читаемо им (XSS).
 * Перезагрузка страницы стирает токены, но Telegram при каждом открытии
 * заново передаёт свежие данные запуска в адресе (`telegramLaunch` читается
 * один раз при загрузке бандла, см. `telegram/launch.ts`) — повторный вход
 * происходит автоматически, без экрана логина.
 */
function TelegramTokenSessionProvider({
  apiOrigin,
  initData,
  children,
}: {
  apiOrigin: string;
  initData: string;
  children: ReactNode;
}) {
  const authApi = useMemo(() => createAuthApi(apiOrigin), [apiOrigin]);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const beforeSignOutHooks = useRef<Set<() => Promise<void>>>(new Set());
  const backoffAttempt = useRef(0);

  // Актуальный статус для колбэка подписки на `tokenAuthority` ниже — см.
  // подробный комментарий у той же конструкции в `session.tsx`: эффект
  // подписки регистрируется один раз, и без `ref` колбэк навсегда помнил бы
  // `status`, каким он был при монтировании.
  const statusRef = useRef<SessionStatus>(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const registerBeforeSignOut = useCallback((hook: () => Promise<void>) => {
    beforeSignOutHooks.current.add(hook);
    return () => {
      beforeSignOutHooks.current.delete(hook);
    };
  }, []);

  const dropSession = useCallback(async () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    backoffAttempt.current = 0;
    await tokenAuthority.drop();
    setUser(null);
    setStatus('guest');
  }, []);

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

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: apiOrigin,
        session: {
          getAccessToken: async () => tokenAuthority.getAccessToken(),
          refresh: tokenAuthority.refresh,
        },
        onSessionExpired: () => void dropSession(),
      }),
    [apiOrigin, dropSession],
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

  // Вход при монтировании: если в памяти уже есть пара (HMR в разработке
  // сохраняет модуль между перерисовками, обычная перезагрузка страницы —
  // нет), используем её; иначе входим по данным запуска, которые Telegram
  // передал в адресе при открытии мини-приложения.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await tokenAuthority.hydrate();
      if (cancelled) return;
      if (stored) {
        scheduleRefresh(stored.accessToken);
        try {
          await loadProfile();
        } catch {
          if (tokenAuthority.peekAccessToken()) setStatus('signed');
        }
        return;
      }
      try {
        const tokens = await authApi.loginWithTelegram(initData);
        if (cancelled) return;
        await tokenAuthority.adopt(tokens);
        scheduleRefresh(tokens.accessToken);
        await loadProfile();
      } catch (error) {
        if (cancelled) return;
        setLoginError(error instanceof Error ? error.message : 'Не удалось войти через Telegram');
        await dropSession();
      }
    })();
    return () => {
      cancelled = true;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [authApi, initData, loadProfile, scheduleRefresh, dropSession]);

  // Токены могли обновиться не из этого эффекта (например, другая вкладка в
  // том же процессе — на практике маловероятно для мини-приложения, но
  // механизм тот же, что у нативной сессии, и не стоит от него отличаться).
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

  // Google/Яндекс требуют cookie на портале — внутри Telegram (в том числе
  // top-level на телефоне) это увело бы человека со страницы мини-приложения,
  // а внутри `<iframe>` (Desktop/web.telegram.org) увело бы только сам фрейм,
  // не решив ничего. Экран входа при провале Telegram-входа — редкий случай
  // (например, устаревшие данные запуска после долгого простоя вкладки), и
  // честная ошибка лучше редиректа, который не сработает.
  const signIn = useCallback(async () => {
    throw new Error('Вход через Google или Яндекс недоступен внутри Telegram. Откройте vedamatch.com напрямую.');
  }, []);

  // Возврата через vedamatch://auth внутри Telegram нет — тот же путь, что у
  // cookie-сессии веба.
  const completeSignIn = useCallback(async () => undefined, []);

  const signInDev = useCallback(
    async (email: string, password: string) => {
      const tokens = await authApi.devLogin(email, password);
      await tokenAuthority.adopt(tokens);
      scheduleRefresh(tokens.accessToken);
      await loadProfile();
    },
    [authApi, loadProfile, scheduleRefresh],
  );

  const getAccessToken = useCallback(() => tokenAuthority.peekAccessToken(), []);

  const signOut = useCallback(async () => {
    await Promise.race([
      Promise.allSettled([...beforeSignOutHooks.current].map((hook) => hook())),
      new Promise<void>((resolve) => setTimeout(resolve, BEFORE_SIGN_OUT_TIMEOUT_MS)),
    ]);
    const current = await tokenAuthority.hydrate();
    if (current) authApi.logout(current.refreshToken).catch(() => undefined);
    await dropSession();
  }, [authApi, dropSession]);

  const value = useMemo<Session>(
    () => ({
      status,
      user,
      api,
      apiOrigin,
      cookieSession: false,
      loginError,
      getAccessToken,
      refreshAccessToken: tokenAuthority.refresh,
      signIn,
      completeSignIn,
      signInDev,
      signOut,
      registerBeforeSignOut,
    }),
    [status, user, api, apiOrigin, loginError, getAccessToken, signIn, completeSignIn, signInDev, signOut, registerBeforeSignOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const { apiOrigin } = appVariant();
  const strategy = resolveWebSessionStrategy(Boolean(telegramLaunch));
  if (strategy === 'telegram-token' && telegramLaunch) {
    return (
      <TelegramTokenSessionProvider apiOrigin={apiOrigin} initData={telegramLaunch.initData}>
        {children}
      </TelegramTokenSessionProvider>
    );
  }
  return <CookieSessionProvider apiOrigin={apiOrigin}>{children}</CookieSessionProvider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession вне SessionProvider');
  return session;
}
