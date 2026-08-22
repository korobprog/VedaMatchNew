"use client";

import type { ChatStreamEvent } from "@vedamatch/shared";
import { API_URL, refreshSession } from "@/lib/http-client";

/**
 * Поток событий чата. Один `EventSource` на вкладку, а не по одному на
 * открытую беседу: браузер держит около шести соединений на домен, и шестой
 * открытый чат просто перестал бы обновляться.
 *
 * Токен живёт в cookie, поэтому `withCredentials`. Протухший access рвёт
 * поток ошибкой — тогда пробуем тихо обновить сессию и переподключиться;
 * обычный разрыв сети лечится штатным переподключением самого EventSource.
 */
export function subscribeToChat(
  onEvent: (event: ChatStreamEvent) => void,
): () => void {
  let source: EventSource | null = null;
  let closed = false;
  let retryDelay = 1000;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (closed) return;
    source = new EventSource(`${API_URL}/chat/stream`, {
      withCredentials: true,
    });

    source.addEventListener("chat", (event) => {
      try {
        onEvent(JSON.parse((event as MessageEvent<string>).data) as ChatStreamEvent);
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

      // Первая попытка — обновить сессию: чаще всего рвётся именно из-за
      // истёкшего access-токена, а не из-за сети.
      void refreshSession().finally(() => {
        if (closed) return;
        retryTimer = setTimeout(connect, retryDelay);
        // Пятнадцать секунд — потолок: дальше растить паузу незачем,
        // человек уже видит, что чат не обновляется.
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
