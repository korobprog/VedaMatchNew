"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import type {
  LibraryEntryLikeResponse,
  LibraryLocale,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { apiBase } from "@/lib/api-base";
import { t } from "./i18n";

const API_URL = apiBase();

/**
 * «Нравится» у материала (VED-549) — сердечко с числом слева от
 * «Поделиться», как у постов Блог-ленты (VED-505).
 *
 * Сердечко и число меняются сразу, а после ответа число берётся с сервера:
 * пока шёл запрос, материал могли отметить и другие. Не вышло — вернуть как
 * было.
 */
export function EntryLikeButton({
  locale,
  entryId,
  initialLiked,
  initialCount,
  className = "",
}: {
  locale: LibraryLocale;
  entryId: string;
  initialLiked: boolean;
  initialCount: number;
  className?: string;
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [pending, setPending] = useState(false);

  async function toggle() {
    // Не `disabled`: отключённая кнопка теряет фокус клавиатуры. Второе
    // нажатие, пока идёт запрос, просто пропускаем.
    if (pending) return;
    const next = !liked;
    const before = { liked, count };
    setLiked(next);
    setCount(Math.max(0, count + (next ? 1 : -1)));
    setPending(true);

    const res = await apiFetch(
      `${API_URL}/library/entries/${encodeURIComponent(entryId)}/like`,
      { method: next ? "PUT" : "DELETE", credentials: "include" },
    ).catch(() => null);
    setPending(false);

    if (!res?.ok) {
      setLiked(before.liked);
      setCount(before.count);
      return;
    }
    const saved = (await res
      .json()
      .catch(() => null)) as LibraryEntryLikeResponse | null;
    if (saved) {
      setLiked(saved.liked);
      setCount(saved.likeCount);
    }
  }

  const label = t(locale, "entry.like");

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      aria-busy={pending}
      aria-pressed={liked}
      aria-label={label}
      title={label}
      className={`inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full border border-glass-brd px-3 text-sm transition-colors hover:border-magenta/60 hover:text-text-0 ${
        liked ? "text-text-0" : "text-text-1"
      } ${className}`}
    >
      <Heart
        aria-hidden
        className={`size-4 ${liked ? "fill-magenta text-magenta" : ""}`}
      />
      {count > 0 && <span className="font-mono">{count}</span>}
    </button>
  );
}
