"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { LibraryCommentDto, LibraryLocale } from "@vedamatch/shared";
import { t } from "./i18n";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const MAX_BODY_LENGTH = 2000;

/**
 * Обсуждение под ссылкой.
 *
 * Список приходит с сервера уже отрисованным, дальше правим его на месте:
 * после отправки не нужен полный перезапрос страницы с плеером.
 */
export function EntryComments({
  locale,
  entryId,
  initialComments,
}: {
  locale: LibraryLocale;
  entryId: string;
  initialComments: LibraryCommentDto[];
}) {
  const [comments, setComments] = useState(initialComments);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const text = body.trim();
    if (!text) return;
    if (text.length > MAX_BODY_LENGTH) {
      setError(t(locale, "comments.tooLong"));
      return;
    }

    setPending(true);
    try {
      const res = await apiFetch(
        `${API_URL}/library/entries/${encodeURIComponent(entryId)}/comments`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: text }),
        },
      );
      if (res.status === 429) {
        setError(t(locale, "comments.rateLimited"));
        return;
      }
      if (!res.ok) {
        setError(t(locale, "comments.failed"));
        return;
      }
      const created = (await res.json()) as LibraryCommentDto;
      setComments((current) => [...current, created]);
      setBody("");
    } catch {
      setError(t(locale, "comments.failed"));
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    const res = await apiFetch(
      `${API_URL}/library/comments/${encodeURIComponent(id)}`,
      { method: "DELETE", credentials: "include" },
    ).catch(() => null);
    if (!res?.ok) {
      setError(t(locale, "comments.failed"));
      return;
    }
    setComments((current) => current.filter((item) => item.id !== id));
  }

  return (
    <section className="mt-8">
      <h2 className="mb-4 font-display text-lg font-semibold text-text-0">
        {t(locale, "comments.title")} · {comments.length}
      </h2>

      {comments.length === 0 && (
        <p className="mb-4 text-sm text-text-2">{t(locale, "comments.empty")}</p>
      )}

      <ul className="mb-6 space-y-3">
        {comments.map((comment) => (
          <li
            key={comment.id}
            className="glass rounded-2xl border border-glass-brd p-3"
          >
            <div className="mb-1 flex items-center gap-2 text-xs text-text-2">
              <span>{comment.author?.name ?? t(locale, "comments.gone")}</span>
              <span aria-hidden>·</span>
              <time dateTime={comment.createdAt}>
                {new Date(comment.createdAt).toLocaleDateString(locale)}
              </time>
              {comment.canDelete && (
                <button
                  type="button"
                  onClick={() => void remove(comment.id)}
                  aria-label={t(locale, "comments.delete")}
                  className="ml-auto text-text-2 hover:text-text-0"
                >
                  <Trash2 aria-hidden className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="whitespace-pre-wrap text-sm text-text-1">
              {comment.body}
            </p>
          </li>
        ))}
      </ul>

      <form onSubmit={submit} className="grid gap-2">
        <label className="text-sm text-text-1">
          {t(locale, "comments.add")}
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={3}
            maxLength={MAX_BODY_LENGTH}
            className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
          />
          <span className="mt-1 block text-xs text-text-2">
            {body.length}/{MAX_BODY_LENGTH}
          </span>
        </label>

        {error && (
          <p className="glass rounded-xl border border-glass-brd p-3 text-sm text-text-0">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending || body.trim().length === 0}
          className="justify-self-start rounded-xl bg-glass-brd/40 px-4 py-2 text-sm text-text-0 hover:bg-glass-brd/60 disabled:opacity-50"
        >
          {t(locale, "comments.submit")}
        </button>
      </form>
    </section>
  );
}
