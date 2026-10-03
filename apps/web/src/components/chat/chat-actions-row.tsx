"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ChatUserSummary } from "@vedamatch/shared";
import { subscribeToChat } from "@/lib/chat-stream";
import { nextUnreadCount } from "./unread-count";
import { QuickConferenceButton } from "./conference/quick-conference-button";
import { MyStatusButton } from "./statuses/my-status-button";
import { ChatAvatar } from "./chat-avatar";

/**
 * Хвост верхнего ряда кнопок «Общения» (VED-730): «Быстрая конференция»,
 * круглые «VedaMatch-новости» и «Избранное» и фотография «Мой статус».
 *
 * Раньше эти четыре элемента жили разноразмерными блоками: конференция —
 * подписью во весь список, новости — строкой канала в «Закреплённых»,
 * «Избранное» — строкой с закладкой, «Мой статус» — плиткой полосы статусов.
 * Теперь они сжаты в компактный ряд кнопок справа в шапке. Переходы и
 * действия прежние — поменялась только форма и место.
 *
 * Круглые кнопки — размером с круг «Мой момент» с плюсиком (62px). Ряд
 * возвращает fragment без своей обёртки: так кнопки становятся flex-элементами
 * ряда, который рисует страница вокруг четырёх прежних иконочных кнопок.
 */
export function ChatActionsRow({
  me,
  news,
}: {
  me: ChatUserSummary;
  /** Официальный канал VedaMatch; `null` — канал ещё не заведён. */
  news: { conversationId: string; unreadCount: number } | null;
}) {
  return (
    <>
      <QuickConferenceButton />
      {news && <NewsButton news={news} viewerId={me.id} />}
      <FavoritesButton />
      <MyStatusButton me={me} />
    </>
  );
}

/**
 * VedaMatch-новости: круглая кнопка вместо строки канала в списке. Счётчик
 * непрочитанных переехал сюда со строкой и живёт по потоку событий, как жил
 * в списке: новое сообщение прибавляет единицу, своё прочтение гасит.
 */
function NewsButton({
  news,
  viewerId,
}: {
  news: { conversationId: string; unreadCount: number };
  viewerId: string;
}) {
  const [unread, setUnread] = useState(news.unreadCount);

  useEffect(() => {
    setUnread(news.unreadCount);
  }, [news.unreadCount]);

  useEffect(() => {
    return subscribeToChat((event) => {
      if (
        event.type === "message.created" &&
        event.conversationId === news.conversationId
      ) {
        setUnread((current) => nextUnreadCount(current, event.message, viewerId));
        return;
      }
      if (
        event.type === "read" &&
        event.conversationId === news.conversationId &&
        event.userId === viewerId
      ) {
        setUnread(0);
      }
    });
  }, [news.conversationId, viewerId]);

  return (
    <Link
      href={`/chat/${news.conversationId}`}
      aria-label={
        unread > 0 ? `VedaMatch-новости: новых ${unread}` : "VedaMatch-новости"
      }
      title="VedaMatch-новости"
      className="relative flex size-[62px] shrink-0 items-center justify-center overflow-hidden rounded-full"
    >
      <ChatAvatar kind="channel" title="VedaMatch" size={62} />
      {unread > 0 && (
        <span className="absolute bottom-0.5 right-0.5 rounded-full bg-mint px-1.5 font-mono text-[11px] leading-[18px] text-bg-0">
          {unread}
        </span>
      )}
    </Link>
  );
}

/**
 * «Избранное» — круглая кнопка вместо строки с закладкой в списке. Ведёт в
 * ту же дверь `/chat/saved`: беседа заводится при первом обращении.
 */
function FavoritesButton() {
  return (
    <Link
      href="/chat/saved"
      aria-label="Избранное"
      title="Избранное"
      className="flex size-[62px] shrink-0 items-center justify-center rounded-full border border-gold/34 bg-gold/12 text-gold"
    >
      <BookmarkIcon />
    </Link>
  );
}

/** Значок закладки — тот же, что был у строки «Избранное» в списке бесед. */
function BookmarkIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6.5 4h11a1 1 0 011 1v15l-6.5-4-6.5 4V5a1 1 0 011-1z" />
    </svg>
  );
}
