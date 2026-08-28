"use client";

import type { ActivityStreamMessage } from "@vedamatch/shared";
import { API_URL, refreshSession } from "@/lib/http-client";

/**
 * Живой поток карточек ленты друзей. Устройство — как у `chat-stream.ts`:
 * один `EventSource` на вкладку, `withCredentials` для cookie-токена,
 * тихое обновление сессии и переподключение при разрыве.
 */
export function subscribeToActivity(
  onEvent: (event: ActivityStreamMessage) => void,
): () => void {
  let source: EventSource | null = null;
  let closed = false;
  let retryDelay = 1000;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (closed) return;
    source = new EventSource(`${API_URL}/activity/stream`, {
      withCredentials: true,
    });

    source.addEventListener("activity", (event) => {
      try {
        onEvent(
          JSON.parse((event as MessageEvent<string>).data) as ActivityStreamMessage,
        );
      } catch {
        // Битое событие пропускаем: следующее придёт целым.
      }
    });

    source.addEventListener("open", () => {
      retryDelay = 1000;
    });

    source.addEventListener("error", () => {
      source?.close();
      source = null;
      if (closed) return;

      void refreshSession().finally(() => {
        if (closed) return;
        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 15_000);
      });
    });
  };

  connect();

  return () => {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    source?.close();
  };
}
