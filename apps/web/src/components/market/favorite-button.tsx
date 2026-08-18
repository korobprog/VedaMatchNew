"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Оптимистичный тумблер избранного с откатом. Сервер идемпотентен, поэтому
 * повторное нажатие безопасно; локальное состояние нужно только чтобы сердечко
 * не ждало круга до сервера.
 */
export function FavoriteButton({
  listingId,
  initial,
  labels,
  className,
}: {
  listingId: string;
  initial: boolean;
  labels: { add: string; remove: string };
  className?: string;
}) {
  const [favorited, setFavorited] = useState(initial);
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (pending) return;
    const next = !favorited;
    setFavorited(next);
    setPending(true);
    try {
      const res = await apiFetch(`${API_URL}/market/listings/${listingId}/favorite`, {
        method: next ? "POST" : "DELETE",
        credentials: "include",
      });
      if (!res.ok) setFavorited(!next);
    } catch {
      setFavorited(!next);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={favorited}
      aria-label={favorited ? labels.remove : labels.add}
      title={favorited ? labels.remove : labels.add}
      className={
        className ??
        "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-glass-brd text-text-2 transition-colors hover:text-magenta disabled:opacity-50"
      }
    >
      <Heart
        aria-hidden
        className={`h-4 w-4 ${favorited ? "fill-magenta text-magenta" : ""}`}
      />
    </button>
  );
}
