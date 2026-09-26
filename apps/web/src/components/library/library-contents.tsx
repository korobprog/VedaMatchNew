"use client";

import { useState } from "react";
import Link from "next/link";
import { ListOrdered } from "lucide-react";
import type {
  LibraryEntryDto,
  LibraryFeedResponse,
  LibraryLocale,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { apiBase } from "@/lib/api-base";
import { buildLibraryQuery } from "@/lib/library-query";
import { EntryShareActions } from "./entry-share-actions";
import { pickLocalized, t } from "./i18n";

const API_URL = apiBase();

/**
 * «Содержание» (VED-538): список названий всех текстовых материалов — статей,
 * катхи и остального, что читают прямо на портале, — как оглавление книги.
 * На главной Образования — всё Образование, на странице автора — его
 * материалы. Напротив каждого названия — «Открыть», «Поделиться» и «В
 * Блог-ленту».
 *
 * Список грузится по нажатию, а не вместе со страницей: оглавление нужно не
 * каждому, а материалов в нём могут быть сотни.
 */
export function LibraryContents({
  locale,
  categorySlug,
}: {
  locale: LibraryLocale;
  /** Рубрика или автор; без неё — всё Образование. */
  categorySlug?: string;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<LibraryEntryDto[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function load(from: string | null) {
    setPending(true);
    setFailed(false);
    try {
      const path = buildLibraryQuery({
        textOnly: "true",
        ...(categorySlug ? { categorySlug } : {}),
        ...(from ? { cursor: from } : {}),
      });
      const response = await apiFetch(`${API_URL}/library/entries${path}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error(String(response.status));
      const page = (await response.json()) as LibraryFeedResponse;
      setItems((current) => [...(from ? (current ?? []) : []), ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && items === null && !pending) void load(null);
  }

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="library-contents"
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-glass-brd px-4 text-sm font-semibold text-text-1 hover:text-text-0"
      >
        <ListOrdered aria-hidden className="size-4" />
        {t(locale, "entry.contents")}
      </button>
      {open && (
        <div
          id="library-contents"
          className="mt-2 rounded-2xl border border-glass-brd bg-bg-1 p-2"
        >
          {items === null ? (
            <p className="px-2 py-3 text-sm text-text-2">
              {failed
                ? t(locale, "contents.failed")
                : t(locale, "contents.loading")}
            </p>
          ) : items.length === 0 ? (
            <p className="px-2 py-3 text-sm text-text-2">
              {t(locale, "contents.empty")}
            </p>
          ) : (
            <ol className="flex flex-col divide-y divide-glass-brd">
              {items.map((entry, index) => {
                const title = pickLocalized(locale, {
                  ru: entry.titleRu,
                  en: entry.titleEn,
                });
                return (
                  <li key={entry.id} className="flex flex-col gap-2 px-2 py-3">
                    <Link
                      href={`/library/entry/${entry.id}`}
                      className="text-sm font-semibold text-text-0 hover:underline"
                    >
                      <span className="mr-1.5 font-mono text-xs text-text-2">
                        {index + 1}.
                      </span>
                      {title}
                    </Link>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/library/entry/${entry.id}`}
                        className="inline-flex min-h-9 items-center rounded-xl border border-glass-brd px-3 py-1.5 text-sm text-text-2 hover:text-text-0"
                      >
                        {t(locale, "entry.open")}
                      </Link>
                      {/* Значками (VED-515): с подписями кнопки пункта
                          уходили на вторую строку. */}
                      <EntryShareActions
                        locale={locale}
                        entryId={entry.id}
                        title={title}
                        blogSharedAt={entry.blogSharedAt}
                        compact
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {cursor && (
            <button
              type="button"
              onClick={() => void load(cursor)}
              disabled={pending}
              className="mt-1 min-h-11 w-full rounded-xl text-sm text-text-1 hover:bg-glass hover:text-text-0 disabled:opacity-50"
            >
              {t(locale, "feed.more")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
