"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { MarketReviewDto } from "@vedamatch/shared";
import { StarRating, StarRatingInput } from "./star-rating";
import { marketErrorCode, marketErrorText } from "./use-market-error";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Отзыв по заявке. Показывается только покупателю и только после завершения:
 * решение о том, можно ли оценивать, принимает сервер, а страница лишь
 * отражает его — иначе форма появлялась бы там, где отправка всё равно упадёт.
 */
export function ReviewForm({
  orderId,
  existing,
  canReview,
}: {
  orderId: string;
  existing: MarketReviewDto | null;
  canReview: boolean;
}) {
  const t = useTranslations("Market");
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (existing) {
    return (
      <section className="glass rounded-2xl border border-glass-brd p-4">
        <h2 className="mb-2 text-sm font-semibold text-text-0">
          {t("reviews.yours")}
        </h2>
        <StarRating value={existing.rating} />
        {existing.body && (
          <p className="mt-2 whitespace-pre-line text-sm text-text-1">
            {existing.body}
          </p>
        )}
        {existing.canDelete && (
          <button
            type="button"
            disabled={pending}
            onClick={() => void remove()}
            className="mt-3 text-xs text-text-2 hover:text-magenta disabled:opacity-50"
          >
            {t("reviews.delete")}
          </button>
        )}
        {error && (
          <p className="mt-2 text-sm text-magenta">{marketErrorText(t, error)}</p>
        )}
      </section>
    );
  }

  if (!canReview) {
    return (
      <p className="glass rounded-2xl border border-glass-brd p-4 text-sm text-text-2">
        {t("reviews.onlyAfterOrder")}
      </p>
    );
  }

  async function remove() {
    if (!existing || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/market/reviews/${existing.id}`, {
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
    } finally {
      setPending(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/market/reviews`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, rating, body: body.trim() || null }),
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

  return (
    <form onSubmit={submit} className="glass rounded-2xl border border-glass-brd p-4">
      <h2 className="mb-3 text-sm font-semibold text-text-0">
        {t("reviews.leave")}
      </h2>

      <StarRatingInput
        value={rating}
        onChange={setRating}
        label={t("reviews.rating")}
      />

      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={t("reviews.text")}
        rows={4}
        maxLength={4000}
        className="mb-3 w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0 placeholder:text-text-2"
      />

      {error && (
        <p className="mb-3 text-sm text-magenta">{marketErrorText(t, error)}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-glass-brd/40 px-4 py-2 text-sm text-text-0 hover:bg-glass-brd/60 disabled:opacity-50"
      >
        {t("reviews.submit")}
      </button>
    </form>
  );
}
