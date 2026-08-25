"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type {
  UnionConnectionRequestDto,
  UnionConnectionRequestsState,
} from "@vedamatch/shared";
import { VerifiedBadge } from "./verified-badge";
import { yearsSuffix } from "./labels";
import { sortIncomingLikes } from "./sort-likes";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Входящие лайки: те, кто уже проявил интерес и ждёт ответа. */
export function UnionLikesPanel({
  requests,
  loadError,
  favoriteUserIds = [],
}: {
  requests: UnionConnectionRequestsState | null;
  loadError?: string | null;
  /** Кого человек отметил звёздочкой. Отмеченные идут первыми. */
  favoriteUserIds?: string[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Локальная копия: звёздочка должна загораться сразу, не дожидаясь
  // перечитывания страницы с сервера.
  const [favorites, setFavorites] = useState(() => new Set(favoriteUserIds));

  const likes = useMemo(() => {
    if (!requests) return null;
    return sortIncomingLikes(
      requests.incoming.filter((request) => request.status === "pending"),
      favorites,
    );
  }, [requests, favorites]);

  if (!likes) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
        {loadError ?? "Не удалось загрузить лайки. Обновите страницу."}
      </div>
    );
  }

  if (likes.length === 0) {
    return (
      <div className="glass rounded-3xl border border-glass-brd p-10 text-center text-sm text-text-1">
        Пока никто не проявил интерес. Заполните анкету подробнее и посмотрите
        новые анкеты — так вас увидит больше людей.
      </div>
    );
  }

  async function respond(requestId: string, action: "accept" | "decline") {
    setPendingId(requestId);
    setError(null);
    try {
      const response = await apiFetch(
        `${API_URL}/union/connection-requests/${requestId}/${action}`,
        { method: "PATCH", credentials: "include" },
      );
      if (!response.ok) {
        throw new Error((await response.text()) || "Не удалось ответить");
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось ответить");
    } finally {
      setPendingId(null);
    }
  }

  /**
   * Звёздочка переключается оптимистично и откатывается при отказе сервера:
   * это личная заметка, ради неё ждать круга до сервера незачем.
   */
  async function toggleFavorite(userId: string) {
    const wasFavorite = favorites.has(userId);
    setFavorites((current) => {
      const next = new Set(current);
      if (wasFavorite) next.delete(userId);
      else next.add(userId);
      return next;
    });
    try {
      const response = await apiFetch(
        `${API_URL}/union/favorites/${encodeURIComponent(userId)}`,
        { method: wasFavorite ? "DELETE" : "POST", credentials: "include" },
      );
      if (!response.ok) throw new Error(await response.text());
    } catch {
      setFavorites((current) => {
        const next = new Set(current);
        if (wasFavorite) next.add(userId);
        else next.delete(userId);
        return next;
      });
      setError("Не удалось изменить избранное");
    }
  }

  return (
    <section>
      {error && <p className="mb-4 text-sm text-red-500">{error}</p>}
      <ul className="grid gap-4 sm:grid-cols-2">
        {likes.map((like) => (
          <LikeCard
            key={like.id}
            like={like}
            busy={pendingId === like.id}
            favorite={favorites.has(like.user.id)}
            onToggleFavorite={toggleFavorite}
            onRespond={respond}
          />
        ))}
      </ul>
    </section>
  );
}

function LikeCard({
  like,
  busy,
  favorite,
  onToggleFavorite,
  onRespond,
}: {
  like: UnionConnectionRequestDto;
  busy: boolean;
  favorite: boolean;
  onToggleFavorite: (userId: string) => void;
  onRespond: (requestId: string, action: "accept" | "decline") => void;
}) {
  const { user } = like;
  const photo = user.photos[0]?.url ?? user.avatarUrl;
  const subtitle =
    [
      user.age != null ? `${user.age} ${yearsSuffix(user.age)}` : null,
      user.city,
    ]
      .filter(Boolean)
      .join(" · ") || "—";

  return (
    <li
      className={`glass relative overflow-hidden rounded-3xl border ${
        like.isSuperlike
          ? "border-[#B23EFF]/50 shadow-[0_0_24px_rgba(178,62,255,0.25)]"
          : "border-glass-brd"
      }`}
    >
      <Link href={`/union/users/${user.id}`} className="block">
        <div className="relative h-56 bg-bg-2">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt={user.name}
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-magenta/25 to-[#B23EFF]/25 font-display text-5xl font-bold text-text-0">
              {user.name.charAt(0).toUpperCase()}
            </span>
          )}
          {like.isSuperlike && (
            <span className="absolute left-3 top-3 rounded-full bg-gradient-to-r from-[#B23EFF] to-[#5B3EFF] px-2.5 py-1 text-xs font-semibold text-white">
              🔥 Суперлайк
            </span>
          )}
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 p-3">
            <span className="truncate font-display text-lg font-bold text-white">
              {user.name}
            </span>
            {user.isVerifiedDevotee && <VerifiedBadge variant="overlay" />}
          </div>
        </div>
      </Link>

      {/* Вне <Link>: иначе тап по звёздочке открывал бы анкету. Это личная
          отметка — отмеченный о ней не узнает. */}
      <button
        type="button"
        onClick={() => onToggleFavorite(user.id)}
        aria-pressed={favorite}
        aria-label={
          favorite ? "Убрать из избранного" : "Отметить как особенно понравившегося"
        }
        title={
          favorite ? "Убрать из избранного" : "Отметить как особенно понравившегося"
        }
        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 backdrop-blur transition hover:bg-black/65"
      >
        <StarGlyph filled={favorite} />
      </button>

      <div className="space-y-3 p-4">
        <p className="text-sm text-text-1">{subtitle}</p>
        {like.message && (
          <p className="line-clamp-3 text-sm text-text-1">«{like.message}»</p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onRespond(like.id, "decline")}
            className="flex-1 rounded-xl glass border border-glass-brd px-3 py-2 text-sm font-medium text-text-1 transition hover:text-text-0 disabled:opacity-50"
          >
            Пропустить
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onRespond(like.id, "accept")}
            className="flex-1 rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-3 py-2 text-sm font-medium text-white transition hover:shadow-[0_0_20px_rgba(255,62,158,0.4)] disabled:opacity-50"
          >
            Ответить взаимностью
          </button>
        </div>
      </div>
    </li>
  );
}

/**
 * Звезда избранного. Своя фигура, а не ★ из шрифта: глиф рисуется системным
 * шрифтом и на телефоне выходит разного веса от устройства к устройству.
 * Незакрашенная — контур, отмеченная — заливка золотом.
 */
function StarGlyph({ filled }: { filled: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden="true"
      className={filled ? "text-gold" : "text-white"}
    >
      <path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L3.5 9.7l5.9-.9z" />
    </svg>
  );
}
