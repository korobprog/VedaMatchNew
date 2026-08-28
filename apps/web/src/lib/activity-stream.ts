"use client";

import type { ActivityStreamMessage } from "@vedamatch/shared";
import { API_URL, refreshSession } from "@/lib/http-client";

/**
 * Живой поток карточек ленты друзей. Устройство — как у `chat-stream.ts`:
 * `withCredentials` для cookie-токена, тихое обновление сессии и
 * переподключение при разрыве.
 *
 * Источник **один на вкладку и общий для всех подписчиков**. Раньше каждый
 * вызов открывал свой `EventSource`, и это работало ровно до второго
 * потребителя: SSE-соединение долгоживущее, браузер держит их к одному
 * источнику по пальцам одной руки, и две ленты на одной странице съедали бы
 * лимит вместе с обычными запросами к API.
 */
type Listener = (event: ActivityStreamMessage) => void;

const listeners = new Set<Listener>();

let source: EventSource | null = null;
let retryDelay = 1000;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function connect(): void {
  // Некому слушать — незачем и держать соединение.
  if (listeners.size === 0 || source) return;

  source = new EventSource(`${API_URL}/activity/stream`, {
    withCredentials: true,
  });

  source.addEventListener("activity", (event) => {
    let message: ActivityStreamMessage;
    try {
      message = JSON.parse(
        (event as MessageEvent<string>).data,
      ) as ActivityStreamMessage;
    } catch {
      // Битое событие пропускаем: следующее придёт целым.
      return;
    }
    // Копия набора: подписчик вправе отписаться прямо в обработчике.
    for (const listener of [...listeners]) listener(message);
  });

  source.addEventListener("open", () => {
    retryDelay = 1000;
  });

  source.addEventListener("error", () => {
    source?.close();
    source = null;
    if (listeners.size === 0) return;

    void refreshSession().finally(() => {
      if (listeners.size === 0) return;
      retryTimer = setTimeout(connect, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 15_000);
    });
  });
}

function disconnectIfIdle(): void {
  if (listeners.size > 0) return;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  source?.close();
  source = null;
  retryDelay = 1000;
}

export function subscribeToActivity(onEvent: Listener): () => void {
  listeners.add(onEvent);
  connect();

  return () => {
    listeners.delete(onEvent);
    disconnectIfIdle();
  };
}
