"use client";

import { useState } from "react";
import type { MotivationFeedResponse, MotivationPostDto } from "@vedamatch/shared";
import { MotivationPostCard } from "./motivation-post-card";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function MotivationFeed({ initial, favorites = false }: { initial: MotivationFeedResponse; favorites?: boolean }) {
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    if (!cursor) return;
    setPending(true);
    setError(null);
    try {
      const query = new URLSearchParams({ cursor });
      if (favorites) query.set("filter", "favorites");
      const response = await fetch(`${API_URL}/motivation/feed?${query}`, { credentials: "include" });
      if (!response.ok) throw new Error(await response.text());
      const page = (await response.json()) as MotivationFeedResponse;
      setItems((current) => mergePosts(current, page.items));
      setCursor(page.nextCursor);
    } catch {
      setError("Не удалось загрузить следующие публикации");
    } finally {
      setPending(false);
    }
  }

  if (items.length === 0) {
    return <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">{favorites ? "В избранном пока ничего нет." : "Новые публикации скоро появятся."}</div>;
  }

  return (
    <div className="space-y-6">
      {items.map((post) => <MotivationPostCard key={post.id} post={post} />)}
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>}
      {cursor && <button type="button" onClick={loadMore} disabled={pending} className="w-full rounded-xl border border-amber-300 px-4 py-3 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-60 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-950">{pending ? "Загружаем..." : "Показать ещё"}</button>}
    </div>
  );
}

function mergePosts(current: MotivationPostDto[], next: MotivationPostDto[]) {
  const ids = new Set(current.map((post) => post.id));
  return [...current, ...next.filter((post) => !ids.has(post.id))];
}
