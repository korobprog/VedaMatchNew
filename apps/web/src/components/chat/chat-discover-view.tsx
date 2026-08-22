"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ChatDiscoverItem, ChatDiscoverState } from "@vedamatch/shared";
import { subscribeToChannel } from "@/lib/chat-client";
import { API_URL, apiFetch } from "@/lib/http-client";
import { ChatAvatar } from "./chat-avatar";
import { withPlural } from "./chat-plural";

/**
 * Каталог открытых бесед — витрина общин: чаты и каналы, куда можно войти
 * самому. Беседы, где человек уже состоит, из каталога не выпадают: иначе
 * подписался — и она исчезла, будто её и не было.
 */
export function ChatDiscoverView({ initial }: { initial: ChatDiscoverState }) {
  const router = useRouter();
  const [items, setItems] = useState(initial.items);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void apiFetch(
        `${API_URL}/chat/discover?q=${encodeURIComponent(query.trim())}`,
        { credentials: "include" },
      )
        .then((res) => (res.ok ? res.json() : null))
        .then((data: ChatDiscoverState | null) => {
          if (data) setItems(data.items);
        })
        .catch(() => undefined);
    }, 350);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query]);

  async function join(item: ChatDiscoverItem) {
    setBusyId(item.conversation.id);
    setError(null);
    try {
      await subscribeToChannel(item.conversation.id);
      router.push(`/chat/${item.conversation.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не получилось войти");
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p className="rounded-xl border border-cyan/30 bg-cyan/10 px-3 py-2 text-sm text-cyan">
          {error}
        </p>
      )}

      <label className="flex h-11 items-center gap-2.5 rounded-2xl border border-glass-brd bg-glass px-3.5">
        <SearchIcon />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по чатам, каналам и общинам"
          className="w-full bg-transparent text-sm text-text-0 outline-none placeholder:text-text-2"
        />
      </label>

      {items.length === 0 ? (
        <p className="rounded-3xl border border-glass-brd bg-glass p-10 text-center text-sm text-text-1">
          {query
            ? "Ничего не нашлось."
            : "Открытых бесед пока нет. Общины откроют свои чаты и каналы — они появятся здесь."}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li
              key={item.conversation.id}
              className="flex items-center gap-3 rounded-2xl p-2.5 transition-colors hover:bg-white/5"
            >
              <ChatAvatar
                kind={item.conversation.kind}
                title={item.conversation.title}
                imageUrl={item.conversation.avatarUrl}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[15px] font-semibold text-text-0">
                  {item.conversation.title}
                </span>
                <span className="truncate text-[13px] text-text-1">
                  {item.conversation.kind === "channel" ? "Канал" : "Группа"}
                  {item.conversation.community
                    ? ` · ${item.conversation.community.name}`
                    : ""}
                  {" · "}
                  {item.conversation.kind === "channel"
                    ? withPlural(
                        item.conversation.membersCount,
                        "подписчик",
                        "подписчика",
                        "подписчиков",
                      )
                    : withPlural(
                        item.conversation.membersCount,
                        "участник",
                        "участника",
                        "участников",
                      )}
                </span>
              </span>

              {item.joined ? (
                <Link
                  href={`/chat/${item.conversation.id}`}
                  className="shrink-0 rounded-xl border border-glass-brd px-3.5 py-2.5 text-[13px] font-semibold text-text-1 hover:text-text-0"
                >
                  Открыть
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => void join(item)}
                  disabled={busyId !== null}
                  className="shrink-0 rounded-xl border border-mint-edge bg-mint px-3.5 py-2.5 text-[13px] font-bold text-on-mint disabled:opacity-60"
                >
                  {busyId === item.conversation.id
                    ? "Вхожу…"
                    : item.conversation.kind === "channel"
                      ? "Подписаться"
                      : "Вступить"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      className="text-text-2"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.6-3.6" />
    </svg>
  );
}
