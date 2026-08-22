"use client";

import { useState } from "react";
import type { ChatMessageDto, ChatThreadState } from "@vedamatch/shared";
import { sendChatMessage, setChatReaction } from "@/lib/chat-client";
import { ChatAvatar } from "./chat-avatar";
import { ChatMessage } from "./chat-message";

/**
 * Обсуждение поста канала. Отдельная страница, а не лента под постом:
 * в канале десять комментариев к старому объявлению иначе вытесняют новое.
 */
export function ChatThreadView({
  initial,
  conversationId,
  viewerId,
}: {
  initial: ChatThreadState;
  conversationId: string;
  viewerId: string;
}) {
  const [comments, setComments] = useState(initial.comments);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      const comment = await sendChatMessage(conversationId, {
        body,
        replyToId: initial.post.id,
      });
      setComments((current) => [...current, comment]);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Комментарий не отправился");
    } finally {
      setBusy(false);
    }
  }

  async function react(message: ChatMessageDto, emoji: string) {
    const { reactions } = await setChatReaction(message.id, emoji);
    setComments((current) =>
      current.map((row) => (row.id === message.id ? { ...row, reactions } : row)),
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <article className="flex flex-col gap-3 rounded-3xl border border-glass-brd bg-glass p-4">
        <header className="flex items-center gap-3">
          <ChatAvatar
            kind="direct"
            user={initial.post.author}
            title={initial.post.author.name}
            size={40}
          />
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="text-sm font-semibold text-text-0">
              {initial.post.author.name}
            </span>
            <span className="font-mono text-[11px] text-text-2">
              {new Date(initial.post.createdAt).toLocaleString("ru-RU")}
            </span>
          </span>
          {typeof initial.post.viewsCount === "number" && (
            <span className="flex items-center gap-1.5 text-text-2">
              <EyeIcon />
              <span className="font-mono text-[11px]">
                {initial.post.viewsCount}
              </span>
            </span>
          )}
        </header>
        <p className="whitespace-pre-wrap text-[15px] leading-[22px] text-text-0">
          {initial.post.body}
        </p>
      </article>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-text-0">
          Комментарии · {comments.length}
        </h2>

        {comments.length === 0 ? (
          <p className="rounded-2xl border border-glass-brd bg-glass p-6 text-center text-sm text-text-1">
            Пока никто не ответил.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {comments.map((comment, index) => (
              <ChatMessage
                key={comment.id}
                // Цитату поста в ветке убираем: он и так стоит выше, и
                // повторять его над каждым комментарием — шум.
                message={{ ...comment, replyTo: null }}
                mine={comment.author.id === viewerId}
                showAuthor={
                  index === 0 ||
                  comments[index - 1]?.author.id !== comment.author.id
                }
                avatar={
                  <ChatAvatar
                    kind="direct"
                    user={comment.author}
                    title={comment.author.name}
                    size={32}
                  />
                }
                canPin={false}
                pinned={false}
                onReply={() => undefined}
                onReact={(message, emoji) => void react(message, emoji)}
                onEdit={() => undefined}
                onDelete={() => undefined}
                onReport={() => undefined}
                onPin={() => undefined}
              />
            ))}
          </div>
        )}
      </section>

      {initial.canComment ? (
        <div className="flex flex-col gap-2">
          {error && (
            <p className="rounded-xl border border-cyan/30 bg-cyan/10 px-3 py-2 text-xs text-cyan">
              {error}
            </p>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              rows={1}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder="Ответить в обсуждении…"
              className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-glass-brd bg-glass px-3.5 py-3 text-[15px] text-text-0 outline-none placeholder:text-text-2"
            />
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || !text.trim()}
              className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-mint-edge bg-mint text-on-mint disabled:opacity-60"
              aria-label="Отправить комментарий"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M4.5 19.5L21 12 4.5 4.5 7 12z" />
                <path d="M7 12h14" />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        <p className="rounded-2xl border border-glass-brd bg-glass px-4 py-3 text-center text-[13px] text-text-1">
          Комментировать может подписчик канала.
        </p>
      )}
    </div>
  );
}

function EyeIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-label="просмотров"
    >
      <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}
