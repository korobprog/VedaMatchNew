"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { ChatStatusAuthorDto } from "@vedamatch/shared";
import { fetchUserChatStatuses } from "@/lib/chat-client";
import { StatusRing } from "./status-ring";
import { StatusViewer } from "./status-viewer";

/**
 * Аватарка человека с кружком статусов (VED-129) — для карточки в
 * справочнике. Есть живые статусы — аватарка становится кнопкой и открывает
 * их просмотр; нет — остаётся картинкой, как была.
 */
export function UserStatusAvatar({
  userId,
  viewerId,
  name,
  size,
  children,
}: {
  userId: string;
  viewerId: string;
  name: string;
  size: number;
  children: ReactNode;
}) {
  const [author, setAuthor] = useState<ChatStatusAuthorDto | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    fetchUserChatStatuses(userId)
      .then((next) =>
        // Ответ без списка статусов (старый API, чужой ответ) — статусов нет.
        setAuthor(
          next && Array.isArray(next.statuses) && next.statuses.length > 0
            ? next
            : null,
        ),
      )
      .catch(() => setAuthor(null));
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const ring = author
    ? { total: author.statuses.length, unseen: author.unseen }
    : null;

  return (
    <>
      {author ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Статусы: ${name}${
            author.unseen > 0 ? `, новых ${author.unseen}` : ""
          }`}
          className="relative shrink-0 rounded-full"
          style={{ width: size, height: size }}
        >
          <StatusRing ring={ring} size={size} />
          {children}
        </button>
      ) : (
        <span
          className="relative inline-block shrink-0"
          style={{ width: size, height: size }}
        >
          {children}
        </span>
      )}
      {open && author && (
        <StatusViewer
          authors={[author]}
          startAuthor={0}
          viewerId={viewerId}
          onClose={() => setOpen(false)}
          onChanged={load}
        />
      )}
    </>
  );
}
