"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { MarketChatState, MarketMessageDto } from "@vedamatch/shared";
import type { Locale } from "@/lib/locale";
import { marketErrorCode, marketErrorText } from "./use-market-error";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Опрос вместо сокета: переписка по сделке неспешная, а постоянное
 *  соединение ради неё держать незачем. */
const POLL_INTERVAL_MS = 15_000;

export function MarketChatPanel({
  initial,
  locale,
}: {
  initial: MarketChatState;
  locale: Locale;
}) {
  const t = useTranslations("Market");
  const [messages, setMessages] = useState(initial.messages);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatId = initial.chat.id;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      void fetch(`${API_URL}/market/chats/${chatId}`, { credentials: "include" })
        .then((res) => (res.ok ? res.json() : null))
        .then((state: MarketChatState | null) => {
          if (!cancelled && state) setMessages(state.messages);
        })
        .catch(() => {
          // Молча: обрыв опроса не повод показывать ошибку поверх переписки.
        });
    };
    const timer = window.setInterval(refresh, POLL_INTERVAL_MS);
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [chatId]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (pending || !draft.trim()) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/market/chats/${chatId}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft }),
      });
      if (!res.ok) {
        setError(await marketErrorCode(res));
        return;
      }
      const message = (await res.json()) as MarketMessageDto;
      setMessages((current) => [...current, message]);
      setDraft("");
    } catch {
      setError("unknown");
    } finally {
      setPending(false);
    }
  }

  async function saveEdit() {
    if (!editing || pending || !editing.body.trim()) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_URL}/market/chats/${chatId}/messages/${editing.id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: editing.body }),
        },
      );
      if (!res.ok) {
        setError(await marketErrorCode(res));
        return;
      }
      const updated = (await res.json()) as MarketMessageDto;
      setMessages((current) =>
        current.map((message) => (message.id === updated.id ? updated : message)),
      );
      setEditing(null);
    } catch {
      setError("unknown");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="glass flex h-[70vh] flex-col rounded-2xl border border-glass-brd">
      <ul className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((message) => (
          <li
            key={message.id}
            className={message.mine ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={[
                "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                message.mine
                  ? "bg-glass-brd/50 text-text-0"
                  : "border border-glass-brd text-text-1",
              ].join(" ")}
            >
              {editing?.id === message.id ? (
                <div>
                  <textarea
                    value={editing.body}
                    onChange={(event) =>
                      setEditing({ id: message.id, body: event.target.value })
                    }
                    rows={3}
                    maxLength={2000}
                    className="w-full rounded-xl border border-glass-brd bg-bg-1 px-2 py-1 text-sm text-text-0"
                  />
                  <div className="mt-1 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void saveEdit()}
                      disabled={pending}
                      className="text-xs text-text-0 hover:underline disabled:opacity-50"
                    >
                      {t("chat.save")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="text-xs text-text-2 hover:text-text-0"
                    >
                      {t("chat.cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="whitespace-pre-line">{message.body}</p>
                  <p className="mt-1 flex items-center gap-2 text-[11px] text-text-2">
                    <span>
                      {new Date(message.createdAt).toLocaleTimeString(locale, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {message.editedAt && <span>{t("chat.edited")}</span>}
                    {message.canEdit && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditing({ id: message.id, body: message.body })
                        }
                        className="hover:text-text-0"
                      >
                        {t("chat.edit")}
                      </button>
                    )}
                  </p>
                </>
              )}
            </div>
          </li>
        ))}
        <div ref={bottomRef} />
      </ul>

      {error && (
        <p className="border-t border-glass-brd px-4 py-2 text-sm text-magenta">
          {marketErrorText(t, error)}
        </p>
      )}

      <form onSubmit={send} className="flex gap-2 border-t border-glass-brd p-3">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t("chat.placeholder")}
          maxLength={2000}
          className="min-w-0 flex-1 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0 placeholder:text-text-2"
        />
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          className="rounded-xl bg-glass-brd/40 px-4 py-2 text-sm text-text-0 hover:bg-glass-brd/60 disabled:opacity-50"
        >
          {t("chat.send")}
        </button>
      </form>
    </div>
  );
}
