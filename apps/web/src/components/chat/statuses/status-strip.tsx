"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import type {
  ChatStatusAuthorDto,
  ChatStatusFeedResponse,
  ChatUserSummary,
} from "@vedamatch/shared";
import { fetchChatStatusFeed } from "@/lib/chat-client";
import { ChatAvatar } from "../chat-avatar";
import { StatusComposer } from "./status-composer";
import { StatusViewer } from "./status-viewer";

/**
 * Полоса статусов над списком бесед (VED-129), как в WhatsApp: первым —
 * «Мой статус» с плюсом, дальше люди со статусами, непросмотренные
 * впереди. Нажатие открывает просмотр; свой статус без статусов — окно
 * публикации.
 */
export function StatusStrip({ me }: { me: ChatUserSummary }) {
  const [feed, setFeed] = useState<ChatStatusFeedResponse | null>(null);
  const [viewing, setViewing] = useState<{
    authors: ChatStatusAuthorDto[];
    start: number;
  } | null>(null);
  const [composing, setComposing] = useState(false);

  const load = useCallback(() => {
    fetchChatStatusFeed()
      .then(setFeed)
      .catch(() => setFeed({ mine: null, others: [] }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const mine = feed?.mine ?? null;
  const others = feed?.others ?? [];

  return (
    <section aria-label="Статусы" className="mb-4">
      <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 py-1 [scrollbar-width:none]">
        <li className="flex w-16 shrink-0 flex-col items-center gap-1">
          <button
            type="button"
            onClick={() =>
              mine
                ? setViewing({ authors: [mine], start: 0 })
                : setComposing(true)
            }
            aria-label={mine ? "Мой статус: посмотреть" : "Добавить статус"}
            className="relative rounded-full"
          >
            <ChatAvatar
              kind="direct"
              user={me}
              title={me.name}
              size={52}
              /* Своё кольцо — зелёное целиком (VED-494): это живые статусы,
                 а не просмотренные чужие, и серое читалось как «погасло». */
              ring={
                mine
                  ? {
                      total: mine.statuses.length,
                      unseen: mine.statuses.length,
                    }
                  : null
              }
            />
          </button>
          {/* Плюс — всегда: ещё один статус можно добавить и поверх живых. */}
          <button
            type="button"
            onClick={() => setComposing(true)}
            aria-label="Новый статус"
            // Поверх аватарки: иначе её кнопка перехватывает нажатие.
            className="relative z-10 -mt-6 ml-10 flex size-6 items-center justify-center rounded-full border-2 border-bg-0 bg-cyan text-bg-0"
          >
            <Plus aria-hidden className="size-3.5" strokeWidth={3} />
          </button>
          <span className="w-full truncate text-center text-[11px] text-text-1">
            Мой статус
          </span>
        </li>
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
      {composing && (
        <StatusComposer
          onClose={() => setComposing(false)}
          onCreated={() => {
            setComposing(false);
            load();
          }}
        />
      )}
    </section>
  );
}
