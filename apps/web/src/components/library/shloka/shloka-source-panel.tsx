"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Image as ImageIcon, Plus, Search, Users } from "lucide-react";
import type {
  LibraryLocale,
  LibraryShlokaListItem,
  LibraryShlokaListResponse,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { apiBase } from "@/lib/api-base";
import { isAbort } from "@/lib/is-abort";
import { VERSE_FONT_FAMILY, verseFontVariables } from "./shloka-font";
import { shlokaHref, verseExcerpt } from "./shloka-mode";
import { shlokaCount, st } from "./shloka-text";

const API_URL = apiBase();

/**
 * Окно источника (VED-386): шлоки раздела по порядку стихов, поиск внутри
 * источника и «Добавить шлоку» — с источником, проставленным по разделу.
 */
export function ShlokaSourcePanel({
  locale,
  categorySlug,
  initial,
}: {
  locale: LibraryLocale;
  categorySlug: string;
  initial: LibraryShlokaListResponse;
}) {
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [page, setPage] = useState(initial);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const searchId = useId();
  const firstRun = useRef(true);

  // Поиск на ходу, с паузой: номер стиха набирают по цифре, и запрос на
  // каждую было бы слишком. Кнопка «Найти» — для тех, кто жмёт Enter.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void load(query.trim(), 0, controller.signal);
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load стабилен по смыслу: зависит только от slug
  }, [query]);

  async function load(q: string, offset: number, signal?: AbortSignal) {
    setPending(true);
    setFailed(false);
    try {
      const params = new URLSearchParams({ category: categorySlug });
      if (q) params.set("q", q);
      if (offset) params.set("offset", String(offset));
      const response = await apiFetch(
        `${API_URL}/library/shlokas?${params.toString()}`,
        { credentials: "include", signal },
      );
      if (!response.ok) throw new Error(String(response.status));
      const next = (await response.json()) as LibraryShlokaListResponse;
      setApplied(q);
      setPage((current) =>
        offset > 0 ? { ...next, items: [...current.items, ...next.items] } : next,
      );
    } catch (error) {
      if (!isAbort(error)) setFailed(true);
    } finally {
      if (!signal?.aborted) setPending(false);
    }
  }

  const addHref = `/library/add/shloka?category=${encodeURIComponent(categorySlug)}`;

  return (
    <section aria-labelledby="shloka-source-heading" className="mb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2
          id="shloka-source-heading"
          className="font-display text-lg font-bold text-text-0"
        >
          {st(locale, "section.title")}
          <span className="ml-2 text-sm font-normal text-text-2">
            {shlokaCount(locale, applied ? page.total : initial.total)}
          </span>
        </h2>
        <Link
          href={addHref}
          className="btn-mint inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold shadow-[0_0_12px_var(--vm-glow-mint)]"
        >
          <Plus aria-hidden className="h-4 w-4" />
          {st(locale, "section.add")}
        </Link>
      </div>

      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          void load(query.trim(), 0);
        }}
        className="mb-2 flex gap-2"
      >
        <label htmlFor={searchId} className="sr-only">
          {st(locale, "section.search")}
        </label>
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={st(locale, "section.searchHint")}
          aria-describedby={`${searchId}-status`}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-glass-brd bg-bg-0 px-3 text-base text-text-0 placeholder:text-text-2"
        />
        <button
          type="submit"
          aria-label={st(locale, "section.searchSubmit")}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-glass-brd text-text-1 hover:text-text-0"
        >
          <Search aria-hidden className="h-5 w-5" />
        </button>
      </form>

      <p
        id={`${searchId}-status`}
        role="status"
        aria-live="polite"
        className="mb-3 min-h-5 text-xs text-text-2"
      >
        {failed
          ? st(locale, "section.failed")
          : applied
            ? page.total === 0
              ? st(locale, "section.nothingFound")
              : shlokaCount(locale, page.total)
            : ""}
      </p>

      {page.items.length === 0 && !applied && !failed ? (
        <p className="glass rounded-2xl border border-glass-brd p-5 text-sm text-text-1">
          {st(locale, "section.empty")}
        </p>
      ) : (
        <ol className={`${verseFontVariables} grid gap-2`} aria-busy={pending}>
          {page.items.map((item) => (
            <ShlokaRow key={item.id} locale={locale} item={item} />
          ))}
        </ol>
      )}

      {page.nextOffset !== null && (
        <button
          type="button"
          disabled={pending}
          onClick={() => void load(applied, page.nextOffset ?? 0)}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-glass-brd text-sm font-semibold text-text-1 hover:text-text-0 disabled:opacity-60"
        >
          {st(locale, "section.more")}
        </button>
      )}
    </section>
  );
}

function ShlokaRow({
  locale,
  item,
}: {
  locale: LibraryLocale;
  item: LibraryShlokaListItem;
}) {
  return (
    <li>
      <Link
        href={shlokaHref(item.id)}
        className="glass grid grid-cols-[4.25rem_1fr] gap-3 rounded-2xl border border-glass-brd p-3 transition-colors hover:border-gold/60 motion-reduce:transition-none"
      >
        <span className="flex min-h-11 items-start justify-center rounded-xl border border-gold/40 bg-bg-1 px-1 py-2 text-center font-mono text-sm font-medium text-text-0">
          {item.verse ?? st(locale, "section.noVerse")}
        </span>
        <span className="grid min-w-0 gap-1">
          <span
            className="line-clamp-2 whitespace-pre-line text-[1.05rem] leading-7 text-text-0"
            style={{ fontFamily: VERSE_FONT_FAMILY }}
          >
            {verseExcerpt(item.text)}
          </span>
          {item.translation && (
            <span className="line-clamp-2 text-sm text-text-1">
              {item.translation}
            </span>
          )}
          {(item.imagesCount > 0 || item.acharyasCount > 0) && (
            <span className="flex gap-3 text-xs text-text-2">
              {item.imagesCount > 0 && (
                <span className="inline-flex items-center gap-1">
                  <ImageIcon aria-hidden className="h-3.5 w-3.5" />
                  <span className="sr-only">{st(locale, "view.images")}:</span>
                  {item.imagesCount}
                </span>
              )}
              {item.acharyasCount > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Users aria-hidden className="h-3.5 w-3.5" />
                  <span className="sr-only">{st(locale, "view.acharyas")}:</span>
                  {item.acharyasCount}
                </span>
              )}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}
