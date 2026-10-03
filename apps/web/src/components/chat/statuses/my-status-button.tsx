"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import type { ChatStatusAuthorDto, ChatUserSummary } from "@vedamatch/shared";
import { fetchChatStatusFeed } from "@/lib/chat-client";
import { ChatAvatar } from "../chat-avatar";
import { StatusComposer } from "./status-composer";
import { StatusViewer } from "./status-viewer";

/**
 * «Мой статус» в верхнем ряду кнопок «Общения» (VED-730): фотография со
 * кольцом статусов и плюс поверх неё. Раньше это была первая плитка полосы
 * статусов — теперь полоса осталась за чужими статусами, а своя фотография
 * стоит справа в ряду кнопок.
 *
 * Действия прежние: фотография открывает свои статусы (или окно публикации,
 * если их ещё нет), плюс — всегда окно публикации. Своё кольцо — зелёное
 * целиком (VED-494): это живые статусы, а не просмотренные чужие.
 */
export function MyStatusButton({ me }: { me: ChatUserSummary }) {
  const [mine, setMine] = useState<ChatStatusAuthorDto | null>(null);
  const [viewing, setViewing] = useState(false);
  const [composing, setComposing] = useState(false);

  const load = useCallback(() => {
    fetchChatStatusFeed()
      .then((feed) => setMine(feed.mine))
      .catch(() => setMine(null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => (mine ? setViewing(true) : setComposing(true))}
        aria-label={mine ? "Мой статус: посмотреть" : "Добавить статус"}
        className="relative rounded-full"
      >
        <ChatAvatar
          kind="direct"
          user={me}
          title={me.name}
          size={52}
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
        className="absolute -bottom-1 -right-1 z-10 flex size-6 items-center justify-center rounded-full border-2 border-bg-0 bg-cyan text-bg-0"
      >
        <Plus aria-hidden className="size-3.5" strokeWidth={3} />
      </button>
      {viewing && mine && (
        <StatusViewer
          authors={[mine]}
          startAuthor={0}
          viewerId={me.id}
          onClose={() => setViewing(false)}
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
    </div>
  );
}
