"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type {
  ChatAttachmentInput,
  ChatConversationDetail,
  ChatMessageDto,
} from "@vedamatch/shared";
import {
  deleteChatMessage,
  editChatMessage,
  loadOlderChatMessages,
  markChatRead,
  markChatViewed,
  pinChatMessage,
  pingChatTyping,
  reportChat,
  sendChatMessage,
  setChatReaction,
} from "@/lib/chat-client";
import { subscribeToChat } from "@/lib/chat-stream";
import { ChatAvatar } from "./chat-avatar";
import { ChatComposer } from "./chat-composer";
import { ChatRoomMenu } from "./chat-room-menu";
import { ChatMessage } from "./chat-message";
import { formatChatDivider } from "./chat-time";
import { isOnline, presenceLabel } from "./chat-presence";
import { withPlural } from "./chat-plural";

/** Сколько «печатает…» держится без нового сигнала. */
const TYPING_TTL_MS = 5000;
/** Реже слать сигнал набора незачем: собеседник видит его почти сразу. */
const TYPING_PING_MS = 3000;

export function ChatRoom({
  initial,
  viewerId,
}: {
  initial: ChatConversationDetail;
  viewerId: string;
}) {
  const [conversation, setConversation] = useState(initial);
  const [messages, setMessages] = useState(initial.messages);
  const [typing, setTyping] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessageDto | null>(null);
  const [editing, setEditing] = useState<ChatMessageDto | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const typingSentAt = useRef(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Открыли переписку — значит прочитали: иначе счётчик висит до перезагрузки.
  useEffect(() => {
    void markChatRead(conversation.id).catch(() => undefined);
  }, [conversation.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  // Посты канала считаются просмотренными при открытии ленты. Чужие и
  // только в канале: в переписке счётчик просмотров не имеет смысла.
  useEffect(() => {
    if (conversation.kind !== "channel") return;
    markChatViewed(
      messages
        .filter((message) => message.author.id !== viewerId)
        .map((message) => message.id),
    );
  }, [conversation.kind, messages, viewerId]);

  useEffect(() => {
    return subscribeToChat((event) => {
      if (
        "conversationId" in event &&
        event.conversationId !== conversation.id
      )
        return;

      if (event.type === "message.created") {
        setMessages((current) =>
          current.some((m) => m.id === event.message.id)
            ? current
            : [...current, event.message],
        );
        setTyping(null);
        if (event.message.author.id !== viewerId)
          void markChatRead(conversation.id).catch(() => undefined);
        return;
      }

      if (event.type === "message.updated") {
        setMessages((current) =>
          current.map((m) => (m.id === event.message.id ? event.message : m)),
        );
        return;
      }

      if (event.type === "message.deleted") {
        setMessages((current) =>
          current.map((m) =>
            m.id === event.messageId
              ? { ...m, deletedAt: new Date().toISOString(), body: "" }
              : m,
          ),
        );
        return;
      }

      if (event.type === "reaction.set") {
        setMessages((current) =>
          current.map((m) =>
            m.id === event.messageId ? { ...m, reactions: event.reactions } : m,
          ),
        );
        return;
      }

      if (event.type === "read" && event.userId !== viewerId) {
        // Собеседник прочитал: галочки у своих сообщений до его отметки.
        setMessages((current) =>
          current.map((m) =>
            m.author.id === viewerId && m.createdAt <= event.lastReadAt
              ? { ...m, readByOthers: true }
              : m,
          ),
        );
        return;
      }

      if (event.type === "pinned") {
        setConversation((current) => ({
          ...current,
          pinnedMessage: event.message,
        }));
        return;
      }

      if (event.type === "typing" && event.user.id !== viewerId) {
        setTyping(event.user.name);
        if (typingTimer.current) clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setTyping(null), TYPING_TTL_MS);
      }
    });
  }, [conversation.id, viewerId]);

  // Закрепляет владелец беседы; в личном диалоге — любой из двоих. Правило
  // повторяет серверное (chat-access.ts): кнопка не должна предлагать то,
  // что API откажется делать.
  const canPin =
    conversation.kind === "direct" ||
    conversation.myRole === "owner" ||
    conversation.myRole === "admin";

  /**
   * Лента канала — это посты. Комментарии живут в обсуждении под постом:
   * иначе ответ на позавчерашнее объявление всплывает поверх сегодняшнего
   * и лента перестаёт быть лентой.
   */
  const feed =
    conversation.kind === "channel"
      ? messages.filter((message) => !message.replyTo)
      : messages;

  const onTyping = useCallback(() => {
    const now = Date.now();
    if (now - typingSentAt.current < TYPING_PING_MS) return;
    typingSentAt.current = now;
    pingChatTyping(conversation.id);
  }, [conversation.id]);

  async function loadOlder() {
    const oldest = messages[0];
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const older = await loadOlderChatMessages(
        conversation.id,
        oldest.createdAt,
      );
      setMessages((current) => [...older.messages, ...current]);
      setConversation((current) => ({ ...current, hasMore: older.hasMore }));
    } finally {
      setLoadingOlder(false);
    }
  }

  async function send(body: string, attachments: ChatAttachmentInput[]) {
    const message = await sendChatMessage(conversation.id, {
      body,
      attachments,
      replyToId: replyTo?.id,
    });
    setMessages((current) =>
      current.some((m) => m.id === message.id) ? current : [...current, message],
    );
    setReplyTo(null);
  }

  async function saveEdit(body: string) {
    if (!editing) return;
    const updated = await editChatMessage(editing.id, body);
    setMessages((current) =>
      current.map((m) => (m.id === updated.id ? updated : m)),
    );
    setEditing(null);
  }

  async function react(message: ChatMessageDto, emoji: string) {
    const { reactions } = await setChatReaction(message.id, emoji);
    setMessages((current) =>
      current.map((m) => (m.id === message.id ? { ...m, reactions } : m)),
    );
  }

  async function remove(message: ChatMessageDto) {
    await deleteChatMessage(message.id);
    setMessages((current) =>
      current.map((m) =>
        m.id === message.id
          ? { ...m, deletedAt: new Date().toISOString(), body: "" }
          : m,
      ),
    );
  }

  async function pin(message: ChatMessageDto, next: boolean) {
    const { pinnedMessage } = await pinChatMessage(
      conversation.id,
      next ? message.id : null,
    );
    setConversation((current) => ({ ...current, pinnedMessage }));
  }

  async function report(message: ChatMessageDto) {
    await reportChat({ reason: "Жалоба из переписки", messageId: message.id });
  }

  return (
    <div className="flex h-[calc(100dvh-9rem)] flex-col">
      <header className="flex items-center gap-2.5 border-b border-glass-brd pb-3">
        <Link
          href="/chat"
          aria-label="К списку бесед"
          className="flex size-11 items-center justify-center rounded-2xl text-text-1 hover:text-text-0"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <ChatAvatar
          kind={conversation.kind}
          user={conversation.companion}
          title={conversation.title}
          size={42}
          imageUrl={conversation.avatarUrl}
          online={isOnline(conversation.companion?.lastSeenAt)}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="truncate text-base font-bold text-text-0">
            {conversation.title}
          </h1>
          <p className="truncate text-xs text-text-2">
            {typing ? (
              <span className="text-cyan">{typing} печатает…</span>
            ) : conversation.kind === "direct" ? (
              // «В сети» точнее пяти минут не бывает: столько же портал
              // ждёт между записями отметки визита.
              (presenceLabel(conversation.companion?.lastSeenAt) ??
              "Личная переписка")
            ) : (
              withPlural(
                conversation.membersCount,
                "участник",
                "участника",
                "участников",
              )
            )}
          </p>
        </div>
        <ChatRoomMenu
          conversation={conversation}
          onChange={(patch) =>
            setConversation((current) => ({ ...current, ...patch }))
          }
        />
      </header>

      {conversation.pinnedMessage && (
        // Закреплённое всегда на виду под шапкой — как на макете: это то,
        // что беседа не должна терять в потоке сообщений.
        <div className="flex items-center gap-2.5 border-b border-glass-brd bg-gold/6 px-1 py-2">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-gold"
            aria-hidden
          >
            <path d="M9 4h6l-1 6 4 3.5V16H6v-2.5L10 10z" />
            <path d="M12 16v4.5" />
          </svg>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-gold">
              Закреплено
            </span>
            <span className="truncate text-xs text-text-1">
              {conversation.pinnedMessage.body || "Вложение"}
            </span>
          </span>
          {canPin && (
            <button
              type="button"
              onClick={() =>
                void pin(conversation.pinnedMessage as ChatMessageDto, false)
              }
              aria-label="Открепить"
              className="flex size-11 items-center justify-center rounded-xl text-text-2 hover:text-text-0"
            >
              ✕
            </button>
          )}
        </div>
      )}

      <div className="scroll-slim flex flex-1 flex-col gap-2.5 overflow-y-auto py-4">
        {conversation.hasMore && (
          <button
            type="button"
            onClick={() => void loadOlder()}
            disabled={loadingOlder}
            className="mx-auto rounded-xl border border-glass-brd px-3 py-1.5 text-xs text-text-1 disabled:opacity-60"
          >
            {loadingOlder ? "Загружаю…" : "Показать раньше"}
          </button>
        )}

        {feed.map((message, index) => {
          const previous = feed[index - 1];
          const newDay =
            !previous ||
            new Date(previous.createdAt).toDateString() !==
              new Date(message.createdAt).toDateString();
          const showAuthor =
            conversation.kind !== "direct" &&
            (!previous || previous.author.id !== message.author.id || newDay);

          return (
            <div key={message.id} className="flex flex-col gap-2.5">
              {newDay && (
                <span className="mx-auto rounded-lg border border-glass-brd bg-white/5 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-text-2">
                  {formatChatDivider(message.createdAt)}
                </span>
              )}
              <ChatMessage
                message={message}
                mine={message.author.id === viewerId}
                showAuthor={showAuthor}
                avatar={
                  // Аватар только в группе и канале: в личном диалоге
                  // собеседник один и он уже в шапке. Место под знак
                  // держится даже у продолжения — иначе подряд идущие
                  // сообщения одного человека прыгают влево.
                  conversation.kind === "direct" ? undefined : showAuthor ? (
                    <ChatAvatar
                      kind="direct"
                      user={message.author}
                      title={message.author.name}
                      size={32}
                    />
                  ) : (
                    <span className="block size-8" aria-hidden />
                  )
                }
                onReply={setReplyTo}
                onReact={(m, emoji) => void react(m, emoji)}
                onEdit={setEditing}
                onDelete={(m) => void remove(m)}
                onReport={(m) => void report(m)}
                canPin={canPin}
                pinned={conversation.pinnedMessage?.id === message.id}
                forwardHref={`/chat/forward/${message.id}`}
                threadHref={
                  conversation.kind === "channel" && !message.replyTo
                    ? `/chat/${conversation.id}/thread/${message.id}`
                    : undefined
                }
                onPin={(m, next) => void pin(m, next)}
              />
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-glass-brd pt-3">
        <ChatComposer
          conversationId={conversation.id}
          replyTo={replyTo}
          editing={editing}
          disabled={!conversation.canWrite}
          disabledReason={
            conversation.state === "request"
              ? "Запрос отправлен — дождитесь ответа"
              : conversation.kind === "channel"
                ? "В канал пишет администрация общины"
                : "Писать сюда нельзя"
          }
          onCancelReply={() => setReplyTo(null)}
          onCancelEdit={() => setEditing(null)}
          onSend={send}
          onSaveEdit={saveEdit}
          onTyping={onTyping}
        />
      </div>
    </div>
  );
}
