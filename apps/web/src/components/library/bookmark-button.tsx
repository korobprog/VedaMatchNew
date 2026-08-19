"use client";

import { useState } from "react";
import { Bookmark } from "lucide-react";
import type { LibraryLocale } from "@vedamatch/shared";
import { t } from "./i18n";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Кнопка «в избранное».
 *
 * Состояние переключаем сразу, а при ошибке возвращаем обратно: сеть здесь
 * не должна заставлять ждать ради одного флажка.
 */
export function BookmarkButton({
  locale,
  entryId,
  initialBookmarked,
  initialCount,
}: {
  locale: LibraryLocale;
  entryId: string;
  initialBookmarked: boolean;
  initialCount: number;
}) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [count, setCount] = useState(initialCount);
  const [pending, setPending] = useState(false);

  async function toggle() {
    const next = !bookmarked;
    setBookmarked(next);
    setCount((current) => current + (next ? 1 : -1));
    setPending(true);

    const res = await apiFetch(
      `${API_URL}/library/entries/${encodeURIComponent(entryId)}/bookmark`,
      { method: next ? "POST" : "DELETE", credentials: "include" },
    ).catch(() => null);
    setPending(false);

    if (!res?.ok) {
      setBookmarked(!next);
      setCount((current) => current + (next ? -1 : 1));
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={pending}
      aria-pressed={bookmarked}
      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm disabled:opacity-50 ${
        bookmarked
          ? "border-glass-brd bg-glass-brd/40 text-text-0"
          : "border-glass-brd text-text-2 hover:text-text-0"
      }`}
    >
      <Bookmark
        aria-hidden
        className={`h-4 w-4 ${bookmarked ? "fill-current" : ""}`}
      />
      {bookmarked
        ? t(locale, "bookmark.remove")
        : t(locale, "bookmark.add")}
      {count > 0 && <span className="text-text-2">{count}</span>}
    </button>
  );
}
