"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { MarketShelfDto } from "@vedamatch/shared";
import { marketErrorCode, marketErrorText } from "./use-market-error";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Полки витрины. Удаление полки не трогает объявления — это ярлык, а не
 *  контейнер, поэтому подтверждения не спрашиваем. */
export function ShelfManager({
  shopId,
  shelves,
}: {
  shopId: string;
  shelves: MarketShelfDto[];
}) {
  const t = useTranslations("Market");
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (pending || !title.trim()) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/market/shops/${shopId}/shelves`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titleRu: title.trim() }),
      });
      if (!res.ok) {
        setError(await marketErrorCode(res));
        return;
      }
      setTitle("");
      router.refresh();
    } catch {
      setError("unknown");
    } finally {
      setPending(false);
    }
  }

  async function remove(shelfId: string) {
    setError(null);
    try {
      const res = await fetch(`${API_URL}/market/shelves/${shelfId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        setError(await marketErrorCode(res));
        return;
      }
      router.refresh();
    } catch {
      setError("unknown");
    }
  }

  return (
    <section className="glass rounded-2xl border border-glass-brd p-5">
      <h2 className="mb-3 font-display text-lg font-semibold text-text-0">
        {t("sell.shelvesTitle")}
      </h2>

      {shelves.length > 0 && (
        <ul className="mb-3 space-y-2">
          {shelves.map((shelf) => (
            <li
              key={shelf.id}
              className="flex items-center gap-2 rounded-xl border border-glass-brd px-3 py-2 text-sm"
            >
              <span className="text-text-0">
                {shelf.titleRu ?? shelf.titleEn ?? shelf.slug}
              </span>
              <span className="text-xs text-text-2">{shelf.listingsCount}</span>
              <button
                type="button"
                onClick={() => void remove(shelf.id)}
                aria-label={t("sell.deleteShelf")}
                className="ml-auto text-text-2 hover:text-magenta"
              >
                <Trash2 aria-hidden className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="flex gap-2">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t("sell.shelfTitle")}
          maxLength={80}
          className="min-w-0 flex-1 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0 placeholder:text-text-2"
        />
        <button
          type="submit"
          disabled={pending || !title.trim()}
          className="rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-2 hover:text-text-0 disabled:opacity-50"
        >
          {t("sell.addShelf")}
        </button>
      </form>

      {error && (
        <p className="mt-2 text-sm text-magenta">{marketErrorText(t, error)}</p>
      )}
    </section>
  );
}
