"use client";

import { useState } from "react";
import type { LibraryFeedResponse, LibraryLocale } from "@vedamatch/shared";
import { buildLibraryQuery } from "@/lib/library-query";
import { EntryCard } from "./entry-card";
import { t } from "./i18n";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function EntryList({
  initialFeed,
  locale,
  query,
}: {
  initialFeed: LibraryFeedResponse;
  locale: LibraryLocale;
  query: Record<string, string | string[] | undefined>;
}) {
  const [feed, setFeed] = useState(initialFeed);
  const [pending, setPending] = useState(false);

  async function loadMore() {
    if (!feed.nextCursor || pending) return;
    setPending(true);
    try {
      const path = buildLibraryQuery({ ...query, cursor: feed.nextCursor });
      const response = await apiFetch(`${API_URL}/library/entries${path}`, {
        credentials: "include",
      });
      if (!response.ok) return;
      const next = (await response.json()) as LibraryFeedResponse;
      setFeed({
        ...next,
        items: [...feed.items, ...next.items],
      });
    } finally {
      setPending(false);
    }
  }

  /**
   * Убираем удалённую ссылку из уже подгруженного списка: router.refresh()
   * вернул бы только первую страницу и сбросил бы всё, что дочитали дальше.
   */
  function dropEntry(id: string) {
    setFeed((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== id),
      total: Math.max(0, current.total - 1),
    }));
  }

  if (feed.items.length === 0) {
    return (
      <p className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
        {t(locale, "feed.empty")}
      </p>
    );
  }

  return (
    <div>
      <div className="grid gap-3">
        {feed.items.map((entry) => (
          <EntryCard
            key={entry.id}
            entry={entry}
            locale={locale}
            onDeleted={() => dropEntry(entry.id)}
          />
        ))}
      </div>
      {feed.nextCursor && (
        <button
          type="button"
          disabled={pending}
          onClick={() => void loadMore()}
          className="mt-4 w-full rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-0 disabled:opacity-50"
        >
          {pending ? t(locale, "feed.loading") : t(locale, "feed.more")}
        </button>
      )}
    </div>
  );
}
