"use client";

import type { ChatStreamEvent } from "@vedamatch/shared";
import { API_URL, refreshSession } from "@/lib/http-client";

/**
 * Поток событий чата. Один `EventSource` на вкладку, сколько бы экранов на
 * него ни подписалось: браузер держит около шести соединений на домен, и
 * второй поток (список бесед + открытая беседа + звонки в layout) уже
 * отнимал бы треть лимита. Подписчики делят одно соединение; оно живёт,
 * пока есть хотя бы один, и закрывается с последним.
 *
 * Токен живёт в cookie, поэтому `withCredentials`. Протухший access рвёт
 * поток ошибкой — тогда пробуем тихо обновить сессию и переподключиться;
 * обычный разрыв сети лечится штатным переподключением самого EventSource.
 */

type Listener = (event: ChatStreamEvent) => void;
type ReconnectListener = () => void;

interface SharedStream {
  listeners: Set<Listener>;
  reconnectListeners: Set<ReconnectListener>;
  source: EventSource | null;
  retryDelay: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  closed: boolean;
  /** Соединение открывалось хоть раз — следующее «open» уже переподключение. */
  everOpened: boolean;
}

let shared: SharedStream | null = null;

function connect(stream: SharedStream): void {
  if (stream.closed) return;
  const source = new EventSource(`${API_URL}/chat/stream`, {
    withCredentials: true,
  });
  stream.source = source;

  source.addEventListener("chat", (event) => {
    let parsed: ChatStreamEvent;
    try {
      parsed = JSON.parse(
        (event as MessageEvent<string>).data,
      ) as ChatStreamEvent;
    } catch {
      // Битое событие пропускаем: следующее придёт целым.
      return;
    }
    for (const listener of stream.listeners) {
      try {
        listener(parsed);
      } catch {
        // Ошибка одного экрана не должна лишать событий остальные.
      }
    }
  });

  source.addEventListener("open", () => {
    stream.retryDelay = 1000;
    // Пока поток был разорван (обрыв сети, протухший токен), сервер мог
    // разослать call.signal, который некому было принять — переподключение
    // само по себе повод дочитать пропущенное (`getChatCallSignals`).
    if (stream.everOpened)
      for (const listener of stream.reconnectListeners) {
        try {
          listener();
        } catch {
          // Ошибка одного подписчика не должна ронять остальных.
        }
      }
    stream.everOpened = true;
  });

  source.addEventListener("error", () => {
    source.close();
    if (stream.source === source) stream.source = null;
    if (stream.closed) return;

    // Первая попытка — обновить сессию: чаще всего рвётся именно из-за
    // истёкшего access-токена, а не из-за сети.
    void refreshSession().finally(() => {
      if (stream.closed) return;
      stream.retryTimer = setTimeout(
        () => connect(stream),
        stream.retryDelay,
      );
      // Пятнадцать секунд — потолок: дальше растить паузу незачем,
      // человек уже видит, что чат не обновляется.
      stream.retryDelay = Math.min(stream.retryDelay * 2, 15_000);
    });
  });
}

function ensureStream(): SharedStream {
  if (!shared || shared.closed) {
    shared = {
      listeners: new Set(),
      reconnectListeners: new Set(),
      source: null,
      retryDelay: 1000,
      retryTimer: null,
      closed: false,
      everOpened: false,
    };
    connect(shared);
  }
  return shared;
}

/** Живёт, пока у стрима есть хоть один слушатель события ИЛИ переподключения. */
function releaseIfIdle(stream: SharedStream): void {
  if (stream.listeners.size > 0 || stream.reconnectListeners.size > 0) return;
  stream.closed = true;
  if (stream.retryTimer) clearTimeout(stream.retryTimer);
  stream.source?.close();
  stream.source = null;
  if (shared === stream) shared = null;
}

export function subscribeToChat(onEvent: Listener): () => void {
  const stream = ensureStream();
  stream.listeners.add(onEvent);

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    stream.listeners.delete(onEvent);
    releaseIfIdle(stream);
  };
}

/**
 * Досинхронизация после обрыва: тот же приём, что `onResync` в приложении
 * (`apps/mobile/src/lib/chat/chat-stream.tsx`). Не вызывается при самом
 * первом подключении вкладки — только когда соединение действительно
 * переустановилось.
 */
export function subscribeToChatReconnect(onReconnect: ReconnectListener): () => void {
  const stream = ensureStream();
  stream.reconnectListeners.add(onReconnect);

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    stream.reconnectListeners.delete(onReconnect);
    releaseIfIdle(stream);
  };
}
