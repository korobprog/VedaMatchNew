"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Newspaper, Share2 } from "lucide-react";
import type {
  LibraryBlogShareResponse,
  LibraryLocale,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { apiBase } from "@/lib/api-base";
import { t } from "./i18n";

const API_URL = apiBase();

const button =
  "inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-glass-brd px-3 py-1.5 text-sm text-text-2 hover:text-text-0 disabled:opacity-50";

function shortDate(iso: string, locale: LibraryLocale): string {
  return new Date(iso).toLocaleDateString(locale === "en" ? "en-GB" : "ru-RU", {
    day: "numeric",
    month: "short",
  });
}

/**
 * «Поделиться» и «В Блог-ленту» у материала (VED-490) и отметка, что
 * материал уже в ленте, с датой.
 *
 * «Поделиться» — системное окно, а где его нет — ссылка в буфер, как на
 * странице поста Блог-ленты. «В Блог-ленту» публикует пост от имени того, кто
 * нажал, поэтому сначала спрашиваем: случайное касание не должно уходить в
 * общую ленту.
 */
export function EntryShareActions({
  locale,
  entryId,
  title,
  blogSharedAt: initialSharedAt,
}: {
  locale: LibraryLocale;
  entryId: string;
  title: string;
  blogSharedAt: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharedAt, setSharedAt] = useState(initialSharedAt);
  const [postId, setPostId] = useState<string | null>(null);

  async function share() {
    const url = `${window.location.origin}/library/entry/${encodeURIComponent(entryId)}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Окно «Поделиться» закрыли — это не ошибка.
    }
  }

  async function toBlog() {
    setError(null);
    setPending(true);
    try {
      const res = await apiFetch(
        `${API_URL}/library/entries/${encodeURIComponent(entryId)}/blog-share`,
        { method: "POST", credentials: "include" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          message?: unknown;
        } | null;
        setError(
          t(
            locale,
            body?.message === "daily_limit_reached"
              ? "entry.toBlogLimit"
              : "entry.toBlogFailed",
          ),
        );
        return;
      }
      const done = (await res.json()) as LibraryBlogShareResponse;
      setSharedAt(done.blogSharedAt);
      setPostId(done.postId);
      setConfirming(false);
    } catch {
      setError(t(locale, "entry.toBlogFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => void share()} className={button}>
        {copied ? (
          <Check aria-hidden className="h-3.5 w-3.5" />
        ) : (
          <Share2 aria-hidden className="h-3.5 w-3.5" />
        )}
        {t(locale, copied ? "entry.shareCopied" : "entry.share")}
      </button>

      {confirming ? (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span className="text-sm text-text-1">
            {t(locale, "entry.toBlogConfirm")}
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => void toBlog()}
            className="btn-mint inline-flex min-h-9 items-center rounded-xl px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
          >
            {t(locale, "entry.toBlogYes")}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirming(false)}
            className={button}
          >
            {t(locale, "entry.toBlogCancel")}
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
          className={button}
        >
          <Newspaper aria-hidden className="h-3.5 w-3.5" />
          {t(locale, "entry.toBlog")}
        </button>
      )}

      {sharedAt && (
        <span className="inline-flex items-center gap-1 text-xs text-text-2">
          <Check aria-hidden className="h-3.5 w-3.5 text-cyan" />
          {t(locale, "entry.inBlog")}
          {" · "}
          {/* Дата в поясе читателя: сервер рисует в своём, отсюда и
              подавление предупреждения гидрации — расхождение в сутки на
              границе дня ожидаемо и исправляется на клиенте. */}
          <time dateTime={sharedAt} suppressHydrationWarning>
            {shortDate(sharedAt, locale)}
          </time>
          {postId && (
            <Link
              href={`/blog/posts/${encodeURIComponent(postId)}`}
              className="ml-1 text-cyan underline-offset-2 hover:underline"
            >
              {t(locale, "entry.openBlogPost")}
            </Link>
          )}
        </span>
      )}

      {error && (
        <span role="alert" className="w-full text-xs text-magenta">
          {error}
        </span>
      )}
    </>
  );
}
