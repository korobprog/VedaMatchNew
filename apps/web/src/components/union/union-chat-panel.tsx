"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { UnionChatState } from "@vedamatch/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function UnionChatPanel({ chat }: { chat: UnionChatState }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          chat.messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.mine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                  message.mine
                    ? "bg-amber-600 text-white"
                    : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                }`}
              >
                <p className="whitespace-pre-wrap">{message.body}</p>
                <time className="mt-1 block text-[11px] opacity-70">
                  {new Date(message.createdAt).toLocaleString("ru-RU")}
                </time>
              </div>
            </div>
          ))
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
