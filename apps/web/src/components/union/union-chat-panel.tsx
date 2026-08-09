"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { UnionChatMessageDto, UnionChatState } from "@vedamatch/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Совпадает с ALLOWED_REACTION_EMOJIS на бэкенде. */
const REACTION_EMOJIS = ["❤️", "🙏", "😂", "😍", "👍", "🔥", "🌸", "🙌"] as const;

/** Быстрый ряд под полем ввода — самые частые смайлики без открытия панели. */
const QUICK_INPUT_EMOJIS = ["😊", "🙏", "❤️", "😂", "👍", "🌸", "🕉️", "✨"];

/** Полная панель для вставки в сообщение, сгруппированная по смыслу. */
const INPUT_EMOJI_GROUPS: { title: string; emojis: string[] }[] = [
  {
    title: "Смайлики",
    emojis: ["😊", "😄", "😁", "😂", "🙂", "😉", "😍", "🥰", "😇", "🤔", "😢", "😴"],
  },
  {
    title: "Жесты и сердца",
    emojis: ["👍", "🙌", "🤝", "👏", "❤️", "💛", "💚", "💙", "✨", "🎉"],
  },
  {
    title: "Духовное",
    emojis: ["🙏", "🕉️", "🪷", "🌸", "🌅", "🕊️", "📿", "🔥"],
  },
];

export function UnionChatPanel({ chat }: { chat: UnionChatState }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editPending, setEditPending] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [reactionPickerId, setReactionPickerId] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_URL}/union/chats/${chat.connection.id}/messages`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: text }),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      setBody("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Сообщение не отправлено");
    } finally {
      setPending(false);
    }
  }

  function insertEmoji(emoji: string) {
    setBody((current) => `${current}${emoji}`);
    setEmojiPickerOpen(false);
  }

  function startEdit(message: UnionChatMessageDto) {
    setEditingId(message.id);
    setEditBody(message.body);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditBody("");
  }

  async function saveEdit(messageId: string) {
    const text = editBody.trim();
    if (!text) return;
    setEditPending(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_URL}/union/chats/${chat.connection.id}/messages/${messageId}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: text }),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      setEditingId(null);
      setEditBody("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Сообщение не изменено");
    } finally {
      setEditPending(false);
    }
  }

  async function copyMessage(message: UnionChatMessageDto) {
    try {
      await navigator.clipboard.writeText(message.body);
      setCopiedId(message.id);
      setTimeout(() => setCopiedId((id) => (id === message.id ? null : id)), 1500);
    } catch {
      // Буфер обмена недоступен (нет разрешения/HTTPS) — молча игнорируем.
    }
  }

  async function toggleReaction(messageId: string, emoji: string) {
    setReactionPickerId(null);
    try {
      const res = await fetch(
        `${API_URL}/union/chats/${chat.connection.id}/messages/${messageId}/reaction`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emoji }),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Реакция не поставлена");
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-3 border-b border-zinc-100 p-4 dark:border-zinc-800">
        {chat.otherUser.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={chat.otherUser.avatarUrl}
            alt={chat.otherUser.name}
            className="h-12 w-12 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-lg font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200">
            {chat.otherUser.name.charAt(0).toUpperCase()}
          </span>
        )}
        <div>
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
            {chat.otherUser.name}
          </h2>
          <p className="text-sm text-zinc-500">
            {[chat.otherUser.city, chat.otherUser.country].filter(Boolean).join(", ") ||
              "Матч Union"}
          </p>
        </div>
      </div>

      <div className="max-h-[60vh] space-y-3 overflow-y-auto p-4">
        {chat.messages.length === 0 ? (
          <p className="rounded-xl bg-zinc-50 p-4 text-center text-sm text-zinc-500 dark:bg-zinc-800">
            Чат открыт после взаимного согласия. Напишите первое сообщение.
          </p>
        ) : (
          chat.messages.map((message) => {
            const isEditing = editingId === message.id;
            const isReactionPickerOpen = reactionPickerId === message.id;
            return (
              <div
                key={message.id}
                className={`group flex flex-col ${message.mine ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                    message.mine
                      ? "bg-amber-600 text-white"
                      : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                  }`}
                >
                  {isEditing ? (
                    <div className="space-y-2">
                      <textarea
                        value={editBody}
                        onChange={(event) => setEditBody(event.target.value)}
                        rows={2}
                        maxLength={2000}
                        autoFocus
                        className="w-full rounded-lg border border-white/40 bg-white/10 px-2 py-1 text-sm text-white placeholder:text-white/70 focus:outline-none"
                      />
                      <div className="flex justify-end gap-2 text-xs">
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="rounded-lg px-2 py-1 text-white/80 hover:text-white"
                        >
                          Отмена
                        </button>
                        <button
                          type="button"
                          onClick={() => saveEdit(message.id)}
                          disabled={editPending || !editBody.trim()}
                          className="rounded-lg bg-white/20 px-2 py-1 font-medium text-white hover:bg-white/30 disabled:opacity-50"
                        >
                          {editPending ? "Сохранение..." : "Сохранить"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="whitespace-pre-wrap">{message.body}</p>
                      <time className="mt-1 block text-[11px] opacity-70">
                        {new Date(message.createdAt).toLocaleString("ru-RU")}
                        {message.editedAt ? " · изменено" : ""}
                      </time>
                    </>
                  )}
                </div>

                {message.reactions.length > 0 && (
                  <div
                    className={`mt-1 flex flex-wrap gap-1 ${message.mine ? "justify-end" : "justify-start"}`}
                  >
                    {message.reactions.map((reaction) => (
                      <button
                        key={reaction.emoji}
                        type="button"
                        onClick={() => toggleReaction(message.id, reaction.emoji)}
                        className={`rounded-full border px-2 py-0.5 text-xs ${
                          reaction.mine
                            ? "border-amber-500 bg-amber-50 dark:bg-amber-950"
                            : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
                        }`}
                      >
                        {reaction.emoji} {reaction.count}
                      </button>
                    ))}
                  </div>
                )}

                {!isEditing && (
                  <div className="relative mt-1 flex items-center gap-3 text-xs text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => copyMessage(message)}
                      className="hover:text-zinc-600 dark:hover:text-zinc-200"
                    >
                      {copiedId === message.id ? "Скопировано" : "Копировать"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setReactionPickerId((id) => (id === message.id ? null : message.id))
                      }
                      className="hover:text-zinc-600 dark:hover:text-zinc-200"
                    >
                      Реакция
                    </button>
                    {message.mine && (
                      <button
                        type="button"
                        onClick={() => startEdit(message)}
                        className="hover:text-zinc-600 dark:hover:text-zinc-200"
                      >
                        Изменить
                      </button>
                    )}
                    {isReactionPickerOpen && (
                      <div
                        className={`absolute top-5 z-10 flex gap-1 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-lg dark:border-zinc-700 dark:bg-zinc-800 ${
                          message.mine ? "right-0" : "left-0"
                        }`}
                      >
                        {REACTION_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => toggleReaction(message.id, emoji)}
                            className="rounded-lg p-1 text-base hover:bg-zinc-100 dark:hover:bg-zinc-700"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={submit} className="border-t border-zinc-100 p-4 dark:border-zinc-800">
        <label className="block">
          <span className="sr-only">Сообщение</span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Напишите осознанное и уважительное сообщение..."
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </label>

        <div className="mt-2 flex flex-wrap items-center gap-1">
          {QUICK_INPUT_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => insertEmoji(emoji)}
              className="rounded-lg p-1 text-base hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              {emoji}
            </button>
          ))}
          <div className="relative">
            <button
              type="button"
              onClick={() => setEmojiPickerOpen((open) => !open)}
              className="rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Ещё emoji
            </button>
            {emojiPickerOpen && (
              <div className="absolute bottom-9 left-0 z-10 w-64 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                {INPUT_EMOJI_GROUPS.map((group) => (
                  <div key={group.title} className="mb-2 last:mb-0">
                    <p className="mb-1 text-[11px] font-medium text-zinc-400">{group.title}</p>
                    <div className="flex flex-wrap gap-1">
                      {group.emojis.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => insertEmoji(emoji)}
                          className="rounded-lg p-1 text-base hover:bg-zinc-100 dark:hover:bg-zinc-700"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            disabled={pending || !body.trim()}
            className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:bg-zinc-300"
          >
            {pending ? "Отправка..." : "Отправить"}
          </button>
        </div>
      </form>
    </section>
  );
}
