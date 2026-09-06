"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { nextUnreadCount } from "./unread-count";
import Link from "next/link";
import type {
  ChatConversationSummary,
  ChatListState,
  ChatSearchHit,
} from "@vedamatch/shared";
import { searchChat } from "@/lib/chat-client";
import { subscribeToChat } from "@/lib/chat-stream";
import { ChatAvatar } from "./chat-avatar";
import { formatChatStamp } from "./chat-time";
import { isOnline } from "./chat-presence";
import { plural } from "./chat-plural";

type Tab = "all" | "direct" | "group" | "channel";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "direct", label: "Личные" },
  { id: "group", label: "Группы" },
  { id: "channel", label: "Каналы" },
];

/**
 * Список бесед. Живой: поток событий двигает беседу наверх и обновляет
 * счётчик, не дожидаясь перезагрузки страницы — иначе «живой чат» живой
 * только внутри открытой переписки.
 */
export function ChatListView({
  initial,
  viewerId,
}: {
  initial: ChatListState;
  /** Своё прочтение гасит счётчик; чужое — про галочки у собеседника. */
  viewerId: string;
}) {
  const router = useRouter();
  const [state, setState] = useState(initial);

  /**
   * Свежий список при каждом заходе.
   *
   * Пока человек читает переписку, список размонтирован и событий не
   * слышит, а роутер держит страницу в кеше — вернувшись назад, он видел
   * прежнюю зелёную метку на беседе, которую только что прочитал.
   * Перезапрос дешевле, чем разбираться, какие счётчики устарели: список
   * бесед и так живой.
   */
  useEffect(() => {
    router.refresh();
  }, [router]);
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");

  /* Обновление сервером приезжает новым `initial`; без этого состояние
     осталось бы тем, что пришло при первом рендере, и `router.refresh()`
     ничего бы не менял. */
  useEffect(() => {
    setState(initial);
  }, [initial]);

  useEffect(() => {
    return subscribeToChat((event) => {
      if (event.type === "conversation.upserted") {
        setState((current) => upsert(current, event.conversation));
        return;
      }
      // Владелец удалил группу — она должна исчезнуть из списка сразу, а не
      // остаться строкой, которая при нажатии отвечает «не найдено».
      if (event.type === "conversation.removed") {
        setState((current) => ({
          ...current,
          conversations: current.conversations.filter(
            (conversation) => conversation.id !== event.conversationId,
          ),
        }));
        return;
      }
      // Открыли беседу — счётчик у неё гаснет здесь же. Раньше список
      // слушал только новые сообщения, и зелёная метка висела до
      // перезагрузки страницы: человек уже прочитал, а список утверждал
      // обратное.
      if (event.type === "read") {
        if (event.userId !== viewerId) return;
        setState((current) => ({
          ...current,
          conversations: current.conversations.map((conversation) =>
            conversation.id === event.conversationId
              ? { ...conversation, unreadCount: 0 }
              : conversation,
          ),
        }));
        return;
      }
      if (event.type === "message.created") {
        setState((current) => ({
          ...current,
          conversations: current.conversations
            .map((conversation) =>
              conversation.id === event.conversationId
                ? {
                    ...conversation,
                    lastMessage: event.message,
                    lastMessageAt: event.message.createdAt,
                    unreadCount: nextUnreadCount(
                      conversation.unreadCount,
                      event.message,
                      viewerId,
                    ),
                  }
                : conversation,
            )
            .sort(byRecency),
        }));
      }
    });
  }, [viewerId]);

  /**
   * Поиск идёт двумя слоями: имена бесед фильтруются на месте (это мгновенно
   * и работает без сети), а сообщения ищет сервер — держать всю переписку
   * в браузере ради поиска незачем.
   */
  const [hits, setHits] = useState<ChatSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const needle = query.trim();
    if (searchTimer.current) clearTimeout(searchTimer.current);
    // Короткий запрос ничего не выставляет: показ находок и так закрыт
    // длиной строки ниже, а setState прямо в теле эффекта гонит лишние
    // перерисовки на каждую букву.
    if (needle.length < 3) return;

    // Пауза после последнего нажатия: запрос на каждую букву — это десяток
    // лишних обращений на одно слово.
    searchTimer.current = setTimeout(() => {
      setSearching(true);
      void searchChat(needle)
        .then((result) => setHits(result.hits))
        .catch(() => setHits([]))
        .finally(() => setSearching(false));
    }, 350);

    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query]);

  /** Находки показываем только под текущий запрос, а не остатки прежнего. */
  const searchActive = query.trim().length >= 3;
  const visibleHits = searchActive ? hits : [];

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return state.conversations
      .filter((c) => (tab === "all" ? true : c.kind === tab))
      .filter((c) =>
        needle
          ? c.title.toLowerCase().includes(needle) ||
            (c.lastMessage?.body ?? "").toLowerCase().includes(needle)
          : true,
      );
  }, [state.conversations, tab, query]);

  const pinned = visible.filter((c) => c.pinned);
  const rest = visible.filter((c) => !c.pinned);

  return (
    <div className="flex flex-col gap-4">
      <label className="flex h-11 items-center gap-2.5 rounded-2xl border border-glass-brd bg-glass px-3.5">
        <SearchIcon />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по людям и сообщениям"
          className="w-full bg-transparent text-sm text-text-0 outline-none placeholder:text-text-2"
        />
      </label>

      <div
        role="tablist"
        aria-label="Вид бесед"
        className="flex rounded-2xl border border-glass-brd bg-white/5 p-0.5"
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`h-9 flex-1 rounded-xl text-[13px] transition-colors ${
              tab === item.id
                ? "border border-glass-brd bg-glass font-bold text-text-0"
                : "font-medium text-text-1 hover:text-text-0"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {state.requestsCount > 0 && (
        <Link
          href="/chat/requests"
          className="flex items-center gap-3 rounded-2xl border border-cyan/30 bg-cyan/10 px-3.5 py-3 transition-colors hover:border-cyan/50"
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-cyan/15 text-cyan">
            <RequestIcon />
          </span>
          <span className="flex flex-1 flex-col">
            <span className="text-sm font-bold text-text-0">
              {state.requestsCount}{" "}
              {plural(state.requestsCount, "запрос", "запроса", "запросов")} на
              переписку
            </span>
            <span className="text-xs text-text-1">
              Первое сообщение от незнакомых людей
            </span>
          </span>
          <ChevronIcon />
        </Link>
      )}

      {searchActive && (
        <div className="flex flex-col gap-1">
          <SectionLabel>
            {searching ? "Ищу в сообщениях…" : `Сообщения · ${visibleHits.length}`}
          </SectionLabel>
          {!searching && visibleHits.length === 0 && (
            <p className="px-2.5 pb-2 text-[13px] text-text-2">
              В переписке ничего не нашлось.
            </p>
          )}
          {visibleHits.map((hit) => (
            <Link
              key={hit.message.id}
              href={`/chat/${hit.conversation.id}`}
              className="flex items-center gap-3 rounded-2xl p-2.5 transition-colors hover:bg-white/5"
            >
              <ChatAvatar
                kind={hit.conversation.kind}
                user={hit.conversation.companion}
                title={hit.conversation.title}
                size={40}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-semibold text-text-0">
                  {hit.conversation.title}
                </span>
                <span className="truncate text-[13px] text-text-1">
                  <span className="text-text-2">{hit.message.author.name}: </span>
                  {hit.message.body}
                </span>
              </span>
              <span className="shrink-0 font-mono text-[11px] text-text-2">
                {formatChatStamp(hit.message.createdAt)}
              </span>
            </Link>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        // При поиске молчим, если нашлись сообщения: «ничего не нашлось» под
        // списком находок читается как отрицание того, что человек видит.
        query.trim() ? (
          visibleHits.length === 0 && !searching ? (
            <p className="rounded-3xl border border-glass-brd bg-glass p-10 text-center text-sm text-text-1">
              Ничего не нашлось.
            </p>
          ) : null
        ) : (
          <p className="rounded-3xl border border-glass-brd bg-glass p-10 text-center text-sm text-text-1">
            Бесед пока нет. Напишите кому-нибудь из Знакомств, Объявлений или
            Рынка — диалог появится здесь.
          </p>
        )
      ) : (
        <div className="flex flex-col gap-1">
          {searchActive && <SectionLabel>Беседы</SectionLabel>}
          {pinned.length > 0 && (
            <>
              <SectionLabel>Закреплённые</SectionLabel>
              {pinned.map((conversation) => (
                <ConversationRow
                  key={conversation.id}
                  conversation={conversation}
                  highlighted
                />
              ))}
              <SectionLabel>Недавние</SectionLabel>
            </>
          )}
          {rest.map((conversation) => (
            <ConversationRow key={conversation.id} conversation={conversation} />
          ))}
        </div>
      )}
    </div>
  );
}

function ConversationRow({
  conversation,
  highlighted,
}: {
  conversation: ChatConversationSummary;
  highlighted?: boolean;
}) {
  const preview = previewOf(conversation);
  return (
    <Link
      href={`/chat/${conversation.id}`}
      className={`flex items-center gap-3 rounded-2xl p-2.5 transition-colors hover:bg-white/5 ${
        highlighted ? "border border-glass-brd bg-glass" : ""
      }`}
    >
      <ChatAvatar
        kind={conversation.kind}
        user={conversation.companion}
        title={conversation.title}
        imageUrl={conversation.avatarUrl}
        online={isOnline(conversation.companion?.lastSeenAt)}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center justify-between gap-2">
          <span
            className={`truncate text-[15px] ${
              conversation.unreadCount > 0
                ? "font-bold text-text-0"
                : "font-semibold text-text-0"
            }`}
          >
            {conversation.title}
          </span>
          <span
            className={`shrink-0 font-mono text-[11px] ${
              conversation.unreadCount > 0 ? "text-cyan" : "text-text-2"
            }`}
          >
            {formatChatStamp(conversation.lastMessageAt)}
          </span>
        </span>
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-[13px] text-text-1">{preview}</span>
          {conversation.unreadCount > 0 ? (
            <span className="shrink-0 rounded-full bg-mint px-1.5 font-mono text-[11px] leading-[22px] text-bg-0">
              {conversation.unreadCount}
            </span>
          ) : conversation.muted ? (
            <MuteIcon />
          ) : null}
        </span>
      </span>
    </Link>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="px-2.5 pb-1.5 pt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-text-2">
      {children}
    </p>
  );
}

/** Строка предпросмотра: у вложения показываем его вид, а не пустоту. */
function previewOf(conversation: ChatConversationSummary): string {
  const message = conversation.lastMessage;
  if (!message) return "Пока ни одного сообщения";
  if (message.deletedAt) return "Сообщение удалено";
  const prefix =
    conversation.kind === "direct" ? "" : `${message.author.name}: `;
  if (message.body) return `${prefix}${message.body}`;

  const kind = message.attachments[0]?.kind;
  const label =
    kind === "voice"
      ? "Голосовое сообщение"
      : kind === "image"
        ? "Фотография"
        : kind === "file"
          ? "Файл"
          : kind === "story"
            ? "Сторис"
            : "Вложение";
  return `${prefix}${label}`;
}

function upsert(
  state: ChatListState,
  conversation: ChatConversationSummary,
): ChatListState {
  const others = state.conversations.filter((c) => c.id !== conversation.id);
  return {
    ...state,
    conversations: [conversation, ...others].sort(byRecency),
  };
}

function byRecency(a: ChatConversationSummary, b: ChatConversationSummary) {
  return (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "");
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

function RequestIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 11.5a8.4 8.4 0 01-9 8.4L3 21l1.1-3.3A8.4 8.4 0 1121 11.5z" />
      <path d="M12 8v4" />
      <path d="M12 15.5h.01" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-cyan"
      aria-hidden
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function MuteIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className="shrink-0 text-text-2"
      aria-label="без звука"
    >
      <path d="M4 4l16 16" />
      <path d="M18 15V11a6 6 0 00-4.3-5.7" />
      <path d="M6 9v2l-2 4h11" />
    </svg>
  );
}
