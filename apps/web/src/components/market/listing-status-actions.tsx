"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { MarketListingStatus } from "@vedamatch/shared";
import { marketErrorCode, marketErrorText } from "./use-market-error";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Статус объявления и его удаление. Из-под модерации автор сам не выходит,
 *  поэтому при `hidden_by_reports` и `removed_by_admin` кнопок нет — только
 *  подпись, и её текст объясняет, почему. */
export function ListingStatusActions({
  listingId,
  status,
}: {
  listingId: string;
  status: MarketListingStatus;
}) {
  const t = useTranslations("Market");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const moderated = status === "hidden_by_reports" || status === "removed_by_admin";

  async function setStatus(next: MarketListingStatus) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_URL}/market/listings/${listingId}/status`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        setError(await marketErrorCode(res));
        return;
      }
      router.refresh();
    } catch {
      setError("unknown");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (pending) return;
    if (!window.confirm(t("sell.confirmDelete"))) return;
    setPending(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_URL}/market/listings/${listingId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        setError(await marketErrorCode(res));
        return;
      }
      router.push("/market/sell/listings");
      router.refresh();
    } catch {
      setError("unknown");
    } finally {
      setPending(false);
    }
  }

  if (moderated) {
    return (
      <p className="rounded-xl border border-glass-brd bg-glass-brd/30 px-3 py-2 text-sm text-text-1">
        {marketErrorText(t, "listing_status_locked")}
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {status !== "published" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => void setStatus("published")}
            className="rounded-xl bg-glass-brd/40 px-3 py-1.5 text-sm text-text-0 hover:bg-glass-brd/60 disabled:opacity-50"
          >
            {t("sell.publish")}
          </button>
        )}
        {status === "published" && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => void setStatus("hidden_by_author")}
              className={secondaryClass}
            >
              {t("sell.unpublish")}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => void setStatus("sold_out")}
              className={secondaryClass}
            >
              {t("sell.markSoldOut")}
            </button>
          </>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => void remove()}
          className="rounded-xl border border-magenta/40 px-3 py-1.5 text-sm text-magenta hover:bg-magenta/10 disabled:opacity-50"
        >
          {t("sell.deleteListing")}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-sm text-magenta">{marketErrorText(t, error)}</p>
      )}
    </div>
  );
}

const secondaryClass =
  "rounded-xl border border-glass-brd px-3 py-1.5 text-sm text-text-2 hover:text-text-0 disabled:opacity-50";
