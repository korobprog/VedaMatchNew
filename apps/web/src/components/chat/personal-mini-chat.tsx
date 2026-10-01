"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageCircle, Send } from "lucide-react";
import type {
  ChatConversationDetail,
  ChatConversationState,
  ChatMessageDto,
} from "@vedamatch/shared";
import {
  createChatConversation,
  fetchDirectChat,
  sendChatMessage,
} from "@/lib/chat-client";

/**
 * Опрос мини-чата. Полноценный мессенджер держит соединение открытым, а
 * мини-переписка на чужой странице — гость на минуту: опрос раз в полминуты
 * дешевле сокета и почти не заметен.
 */
const POLL_INTERVAL_MS = 30_000;

/** Сколько последних сообщений показывает миниатюра. */
const PREVIEW_COUNT = 8;

type MiniChatState = {
  id: string;
  state: ChatConversationState;
  canWrite: boolean;
  messages: ChatMessageDto[];
};

function toState(chat: ChatConversationDetail): MiniChatState {
  return {
    id: chat.id,
    state: chat.state,
    canWrite: chat.canWrite,
    messages: chat.messages,
  };
}

/** Почему поле ввода закрыто; `null` — писать можно. */
function composerHint(
  chat: MiniChatState | null,
  viewerId: string,
  name: string,
): string | null {
  if (!chat || chat.canWrite) return null;
  if (chat.state === "request") {
    // Запрос пишется одним сообщением, так что автор первого сообщения —
    // тот, кто его отправил. Текст совпадает с большим мессенджером.
    return chat.messages[0]?.author.id === viewerId
      ? "Запрос отправлен — дождитесь ответа"
      : `${name} ждёт вашего ответа — ответьте в мессенджере`;
  }
  return "Писать сюда нельзя";
}

/**
 * Миниатюра мессенджера на личной странице участника (VED-686).
 *
 * Показывает последние сообщения переписки с хозяином страницы и даёт
 * написать, не уходя со страницы; кнопка в шапке открывает полноценный
 * мессенджер. Переписку не заводит: пока сообщение не написано, диалога нет
 * и запрос хозяину страницы не уходит.
 */
export function PersonalMiniChat({
  initial,
  companion,
  viewerId,
}: {
  /** Переписка с хозяином страницы, если она уже есть. */
  initial: ChatConversationDetail | null;
  companion: { id: string; name: string };
  viewerId: string;
}) {
  const [chat, setChat] = useState<MiniChatState | null>(
    initial ? toState(initial) : null,
  );
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const messages = chat ? chat.messages.slice(-PREVIEW_COUNT) : [];
  const hint = composerHint(chat, viewerId, companion.name);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  // Пока переписки нет, опрашивать нечего: мини-чат на чужой странице не
  // должен долбить сервер за каждым её открытием.
  useEffect(() => {
    if (!chat) return;
    let cancelled = false;
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      void fetchDirectChat(companion.id)
        .then((fresh) => {
          if (!cancelled && fresh) setChat(toState(fresh));
        })
        .catch(() => {
          // Обрыв опроса не повод пугать ошибкой поверх переписки.
        });
    };
    const timer = window.setInterval(refresh, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [chat, companion.id]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || pending) return;
    setPending(true);
    setError(null);
    try {
      let target = chat;
      if (!target) {
        // Переписки нет — заводим её тем же действием, что кнопка
        // «Написать»: первое сообщение станет запросом на переписку.
        const created = await createChatConversation({
          kind: "direct",
          userId: companion.id,
        });
        target = {
          id: created.id,
          state: created.state,
          canWrite: created.canWrite,
          messages: [],
        };
      }
      if (!target.canWrite) {
        // Запрос уже стоит со своим сообщением: второе не отправится, и
        // лучше сразу показать это подписью поля, чем ошибкой.
        setChat(target);
        return;
      }
      const message = await sendChatMessage(target.id, { body });
      setChat({
        ...target,
        // Запрос пишется один раз — дальше поле закрывается до ответа.
        canWrite: target.state === "request" ? false : target.canWrite,
        messages: [...target.messages, message],
      });
      setDraft("");
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "Не получилось отправить. Попробуйте ещё раз.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      aria-label={`Мессенджер с ${companion.name}`}
      className="mb-6 rounded-2xl border border-glass-brd bg-glass p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-text-0">
          <MessageCircle aria-hidden className="size-4 text-cyan" />
          Мессенджер
        </h2>
        <Link
          href={`/chat/with/${encodeURIComponent(companion.id)}`}
          className="inline-flex min-h-11 items-center rounded-lg border border-glass-brd px-3 text-xs font-semibold text-text-0 transition-colors hover:border-cyan/60"
        >
          Открыть мессенджер
        </Link>
      </div>

      {messages.length === 0 ? (
        <p className="mt-3 rounded-xl border border-glass-brd bg-bg-1 px-3 py-4 text-center text-xs text-text-1">
          Переписки пока нет. Напишите — {companion.name} получит запрос на
          общение и ответит, когда примет его.
        </p>
      ) : (
        <ul className="mt-3 flex max-h-56 flex-col gap-1.5 overflow-y-auto">
          {messages.map((message) => {
            const mine = message.author.id === viewerId;
            return (
              <li
                key={message.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <span
                  className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-xs leading-5 ${
                    mine
                      ? "rounded-br-sm bg-cyan/15 text-text-0"
                      : "rounded-bl-sm bg-bg-1 text-text-1"
                  }`}
                >
                  {message.body || "Вложение"}
                </span>
              </li>
            );
          })}
          <div ref={bottomRef} />
        </ul>
      )}

      {hint ? (
        <p className="mt-3 text-xs text-text-1">{hint}</p>
      ) : (
        <form onSubmit={send} className="mt-3 flex items-center gap-2">
          <label htmlFor="personal-mini-chat-draft" className="sr-only">
            Сообщение
          </label>
          <input
            id="personal-mini-chat-draft"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={`Сообщение для ${companion.name}`}
            disabled={pending}
            className="h-11 min-w-0 flex-1 rounded-lg border border-glass-brd bg-bg-1 px-3 text-sm text-text-0 placeholder:text-text-2 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={pending || !draft.trim()}
            aria-label="Отправить"
            className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-mint text-on-mint disabled:opacity-50"
          >
            <Send aria-hidden className="size-4" />
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-magenta">
          {error}
        </p>
      )}
    </section>
  );
}
