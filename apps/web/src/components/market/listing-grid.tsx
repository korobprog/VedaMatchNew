"use client";

import { useState } from "react";
import type { MarketListingFeedResponse } from "@vedamatch/shared";
import { buildMarketQuery } from "@/lib/market-query";
import type { Locale } from "@/lib/locale";
import { ListingCard, type ListingCardLabels } from "./listing-card";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface ListingGridLabels extends ListingCardLabels {
  empty: string;
  emptyHint: string;
  loadMore: string;
  total: string;
}

export function ListingGrid({
  initialFeed,
  locale,
  query,
  labels,
  /** Путь API, из которого берётся следующая страница. Витрина магазина и
   *  избранное — те же ленты, но за другими адресами. */
  endpoint = "/market/listings",
}: {
  initialFeed: MarketListingFeedResponse;
  locale: Locale;
  query: Record<string, string | string[] | undefined>;
  labels: ListingGridLabels;
  endpoint?: string;
}) {
  const [feed, setFeed] = useState(initialFeed);
  const [pending, setPending] = useState(false);

  async function loadMore() {
    if (!feed.nextCursor || pending) return;
    setPending(true);
    try {
      const path = buildMarketQuery(query, { cursor: feed.nextCursor });
      const response = await fetch(`${API_URL}${endpoint}${path}`, {
        credentials: "include",
      });
      if (!response.ok) return;
      const next = (await response.json()) as MarketListingFeedResponse;
      // Дописываем к уже загруженному: router.refresh() вернул бы только
      // первую страницу и стёр всё, что дочитали дальше.
      setFeed({ ...next, items: [...feed.items, ...next.items] });
    } finally {
      setPending(false);
    }
  }

  if (feed.items.length === 0) {
    return (
      <div className="glass rounded-2xl border border-glass-brd p-8 text-center">
        <p className="text-text-1">{labels.empty}</p>
        <p className="mt-1 text-sm text-text-2">{labels.emptyHint}</p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3 text-sm text-text-2">
        {labels.total.replace("{count}", String(feed.total))}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {feed.items.map((listing) => (
          <ListingCard
            key={listing.id}
            listing={listing}
            locale={locale}
            labels={labels}
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
          {labels.loadMore}
        </button>
      )}
    </div>
  );
}
