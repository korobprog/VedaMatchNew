"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { MarketCommentDto, MarketCommentsResponse } from "@vedamatch/shared";
import type { Locale } from "@/lib/locale";
import { ReportButton } from "./report-dialog";
import { marketErrorCode, marketErrorText } from "./use-market-error";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Публичные вопросы под объявлением. Личное — в переписку, о чём прямо
 *  сказано подсказкой: иначе в комментариях появляются адреса и телефоны. */
export function CommentList({
  listingId,
  initial,
  locale,
}: {
  listingId: string;
  initial: MarketCommentsResponse;
  locale: Locale;
}) {
  const t = useTranslations("Market");
  const [items, setItems] = useState(initial.items);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (pending || !draft.trim()) return;
    setPending(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_URL}/market/listings/${listingId}/comments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft }),
      });
      if (!res.ok) {
        setError(await marketErrorCode(res));
        return;
      }
      const created = (await res.json()) as MarketCommentDto;
      setItems((current) => [...current, created]);
      setDraft("");
    } catch {
      setError("unknown");
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      const res = await apiFetch(`${API_URL}/market/comments/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        setError(await marketErrorCode(res));
        return;
      }
      setItems((current) => current.filter((item) => item.id !== id));
    } catch {
      setError("unknown");
    }
  }

  return (
    <section className="mt-8">
      <h2 className="mb-3 font-display text-lg font-semibold text-text-0">
        {t("comments.title")}
      </h2>

      {items.length === 0 ? (
        <p className="text-sm text-text-2">{t("comments.empty")}</p>
      ) : (
        <ul className="mb-4 space-y-3">
          {items.map((comment) => (
            <li
              key={comment.id}
              className="glass rounded-2xl border border-glass-brd p-3"
            >
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-text-2">
                <span className="text-text-0">{comment.author?.name ?? "—"}</span>
                <span>
                  {new Date(comment.createdAt).toLocaleDateString(locale)}
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <ReportButton targetKind="comment" targetId={comment.id} />
                  {comment.canDelete && (
                    <button
                      type="button"
                      onClick={() => void remove(comment.id)}
                      aria-label={t("comments.delete")}
                      className="hover:text-magenta"
                    >
                      <Trash2 aria-hidden className="h-3 w-3" />
                    </button>
                  )}
                </span>
              </div>
              <p className="whitespace-pre-line text-sm text-text-1">
                {comment.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t("comments.placeholder")}
          rows={3}
          maxLength={2000}
          className="mb-2 w-full rounded-xl border border-glass-brd bg-bg-1 px-3 py-2 text-sm text-text-0 placeholder:text-text-2"
        />
        <p className="mb-2 text-xs text-text-2">{t("comments.hint")}</p>
        {error && (
          <p className="mb-2 text-sm text-magenta">{marketErrorText(t, error)}</p>
        )}
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          className="rounded-xl bg-glass-brd/40 px-4 py-2 text-sm text-text-0 hover:bg-glass-brd/60 disabled:opacity-50"
        >
          {t("comments.submit")}
        </button>
      </form>
    </section>
  );
}
