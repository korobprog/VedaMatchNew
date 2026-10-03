"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ChatStatusAuthorDto,
  ChatStatusFeedResponse,
  ChatUserSummary,
} from "@vedamatch/shared";
import { fetchChatStatusFeed } from "@/lib/chat-client";
import { ChatAvatar } from "../chat-avatar";
import { StatusViewer } from "./status-viewer";

/**
 * Полоса статусов над списком бесед (VED-129), как в WhatsApp: люди со
 * статусами, непросмотренные впереди. Нажатие открывает просмотр.
 *
 * «Мой статус» здесь больше не плитка: своя фотография со статусом стоит в
 * верхнем ряду кнопок (VED-730), а полоса осталась за чужими статусами и
 * прячется, когда их нет ни у кого.
 */
export function StatusStrip({ me }: { me: ChatUserSummary }) {
  const [feed, setFeed] = useState<ChatStatusFeedResponse | null>(null);
  const [viewing, setViewing] = useState<{
    authors: ChatStatusAuthorDto[];
    start: number;
  } | null>(null);

  const load = useCallback(() => {
    fetchChatStatusFeed()
      .then(setFeed)
      .catch(() => setFeed({ mine: null, others: [] }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const others = feed?.others ?? [];
  if (others.length === 0) return null;

  return (
    <section aria-label="Статусы" className="mb-4">
      <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 py-1 [scrollbar-width:none]">
        {others.map((author, index) => (
          <li
            key={author.user.id}
            className="flex w-16 shrink-0 flex-col items-center gap-1"
          >
            <button
              type="button"
              onClick={() => setViewing({ authors: others, start: index })}
              aria-label={`Статусы: ${author.user.name}${
                author.unseen > 0 ? `, новых ${author.unseen}` : ""
              }`}
              className="rounded-full"
            >
              <ChatAvatar
                kind="direct"
                user={author.user}
                title={author.user.name}
                size={52}
                ring={{ total: author.statuses.length, unseen: author.unseen }}
              />
            </button>
            <span className="mt-1.5 w-full truncate text-center text-[11px] text-text-1">
              {author.user.name}
            </span>
          </li>
        ))}
      </ul>

      {viewing && (
        <StatusViewer
          authors={viewing.authors}
          startAuthor={viewing.start}
          viewerId={me.id}
          onClose={() => setViewing(null)}
          onChanged={load}
        />
      )}
    </section>
  );
}
