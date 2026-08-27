"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/http-client";

// Свой API_URL, как в swipe-deck.tsx: lib/union-api.ts — серверный модуль
// (берёт токен через cookies()), из браузера он недоступен.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * «Убрать совсем» — в отличие от крестика, который прячет анкету только до
 * конца круга. Стоит сверху слева, отдельно от ряда решений: это не выбор
 * между людьми, а изъятие человека из выдачи, и путать их кнопками рядом
 * не стоит.
 */
export function ArchiveButton({
  userId,
  onArchived,
}: {
  userId: string;
  onArchived: () => void;
}) {
  const [pending, setPending] = useState(false);

  async function archive() {
    if (pending) return;
    setPending(true);
    try {
      const res = await apiFetch(
        `${API_URL}/union/archive/${encodeURIComponent(userId)}`,
        { method: "POST", credentials: "include" },
      );
      if (res.ok) onArchived();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void archive()}
      disabled={pending}
      aria-label="Убрать в архив"
      title="Убрать в архив — вернуть можно в разделе «Скрытые»"
      className="absolute left-3 top-[calc(max(0.75rem,env(safe-area-inset-top))+5rem)] z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/65 disabled:opacity-50"
    >
      <BoxIcon />
    </button>
  );
}

/** Коробка: своя фигура, а не эмодзи — 📦 менялся бы от устройства к устройству. */
function BoxIcon() {
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
      aria-hidden="true"
    >
      <path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5z" />
      <path d="M3 8.5 12 13l9-4.5" />
      <path d="M12 13v7" />
    </svg>
  );
}
