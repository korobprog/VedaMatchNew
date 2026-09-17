import type { ChatStreamEvent } from '@vedamatch/shared';
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { AppState } from 'react-native';
import EventSource from 'react-native-sse';
import { useSession } from '@/lib/auth/session';
import { streamBackoffMs } from './stream-backoff';

/**
 * Один поток событий чата на всё приложение (`GET /chat/stream`), как одна
 * вкладка на сайте. Экраны подписываются на события и на «пересинхронизацию»:
 * сервер не повторяет пропущенное, поэтому после обрыва, возврата из фона и
 * плановой перезагрузки потока список и открытая беседа перечитываются.
 *
 * Поток в фоне закрывается: сообщения, пришедшие в это время, доставят пуши, а
 * держать соединение ради невидимого экрана значит тратить батарею.
 */

type EventListener = (event: ChatStreamEvent) => void;
type ResyncListener = () => void;

interface ChatStreamApi {
  subscribe(listener: EventListener): () => void;
  onResync(listener: ResyncListener): () => void;
}

const ChatStreamContext = createContext<ChatStreamApi | null>(null);

/**
 * react-native-sse копит весь ответ в XHR: за часы открытого потока это
 * мегабайты. Перезагружаем соединение раз в десять минут и досинхронизируемся.
 */
const RECYCLE_MS = 10 * 60 * 1000;

export function ChatStreamProvider({ children }: { children: ReactNode }) {
  const { status, apiOrigin, cookieSession, getAccessToken, refreshAccessToken } = useSession();
  const listeners = useRef(new Set<EventListener>());
  const resyncListeners = useRef(new Set<ResyncListener>());
  const apiRef = useRef<ChatStreamApi>({
    subscribe(listener) {
      listeners.current.add(listener);
      return () => listeners.current.delete(listener);
    },
    onResync(listener) {
      resyncListeners.current.add(listener);
      return () => resyncListeners.current.delete(listener);
    },
  });

  useEffect(() => {
    if (status !== 'signed') return;
    let source: EventSource<'chat' | 'ping'> | null = null;
    let attempt = 0;
    let everOpened = false;
    let stopped = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let recycleTimer: ReturnType<typeof setTimeout> | null = null;

    const resync = () => resyncListeners.current.forEach((listener) => listener());

    const close = () => {
      if (retryTimer) clearTimeout(retryTimer);
      if (recycleTimer) clearTimeout(recycleTimer);
      retryTimer = null;
      recycleTimer = null;
      source?.removeAllEventListeners();
      source?.close();
      source = null;
    };

    const scheduleRetry = () => {
      if (stopped) return;
      close();
      retryTimer = setTimeout(open, streamBackoffMs(attempt));
      attempt += 1;
    };

    const open = () => {
      if (stopped) return;
      close();
      const token = getAccessToken();
      // Веб-версия: токена в JS нет, поток идёт с cookie портала.
      if (!token && !cookieSession) return;
      const next = new EventSource<'chat' | 'ping'>(`${apiOrigin}/chat/stream`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        withCredentials: cookieSession,
        pollingInterval: 0,
      });
      source = next;
      next.addEventListener('open', () => {
        attempt = 0;
        if (everOpened) resync();
        everOpened = true;
        recycleTimer = setTimeout(open, RECYCLE_MS);
      });
      next.addEventListener('chat', (event) => {
        if (!event.data) return;
        try {
          const parsed = JSON.parse(event.data) as ChatStreamEvent;
          listeners.current.forEach((listener) => listener(parsed));
        } catch {
          // Битое событие пропускаем: следующая досинхронизация всё поправит.
        }
      });
      next.addEventListener('error', (event) => {
        if ('xhrStatus' in event && event.xhrStatus === 401) {
          // 'rejected' — сессия действительно закончилась, дальше пробовать
          // нечем. 'refreshed'/'unavailable' — обычный повтор через тот же
          // бэкофф потока: для 'unavailable' новый токен появится позже сам
          // (проактивный ретрай `session.tsx`), а `open()` всё равно читает
          // токен заново при каждой попытке.
          void refreshAccessToken().then((result) => (result.kind === 'rejected' ? close() : scheduleRetry()));
          return;
        }
        scheduleRetry();
      });
    };

    open();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        attempt = 0;
        open();
        resync();
      } else if (state === 'background') {
        close();
      }
    });

    return () => {
      stopped = true;
      appState.remove();
      close();
    };
  }, [status, apiOrigin, cookieSession, getAccessToken, refreshAccessToken]);

  return <ChatStreamContext.Provider value={apiRef.current}>{children}</ChatStreamContext.Provider>;
}

export function useChatStream(): ChatStreamApi {
  const api = useContext(ChatStreamContext);
  if (!api) throw new Error('useChatStream вне ChatStreamProvider');
  return api;
}
