"use client";

import { useState } from "react";
import type { BlogFeedResponse, BlogPostDto } from "@vedamatch/shared";
import { BlogApiError, fetchBlogFeed } from "@/lib/blog-client-api";
import { BlogComposer } from "./blog-composer";
import { BlogPostCard } from "./blog-post-card";

/**
 * Полная лента сервиса: всё, что когда-либо публиковали, свежее сверху.
 * Именно её открывает нажатие на виджет главной (VED-238).
 */
export function BlogFeed({
  initial,
  scope = "all",
  showComposer = true,
}: {
  initial: BlogFeedResponse;
  scope?: "current" | "all";
  showComposer?: boolean;
}) {
  const [posts, setPosts] = useState(initial.posts);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function more() {
    if (!cursor) return;
    setPending(true);
    setError(null);
    try {
      const page = await fetchBlogFeed(scope, cursor);
      setPosts((current) => [...current, ...page.posts]);
      setCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof BlogApiError
          ? cause.message
          : "Не удалось загрузить ещё.",
      );
    } finally {
      setPending(false);
    }
  }

  function replace(post: BlogPostDto) {
    setPosts((current) =>
      current.map((item) => (item.id === post.id ? post : item)),
    );
  }

  return (
    <div>
      {showComposer && (
        <BlogComposer
          onPublished={(post) => setPosts((current) => [post, ...current])}
        />
      )}

      {posts.length === 0 ? (
        <p className="rounded-2xl border border-glass-brd bg-glass px-4 py-8 text-center text-sm text-text-1">
          Здесь пока пусто. Напишите первый пост — его увидят все на главной.
        </p>
      ) : (
        /* `space-y-3`, а не 4 (VED-371): восемь пикселей между тремя
           постами — это запас, при котором три карточки с заголовками в
           две строки ещё целиком помещаются на экран 375×812. */
        <div className="space-y-3">
          {posts.map((post) => (
            <BlogPostCard
              key={post.id}
              post={post}
              onChanged={replace}
              onRemoved={(id) =>
                setPosts((current) => current.filter((item) => item.id !== id))
              }
            />
          ))}
        </div>
      )}

      {cursor && (
        <button
          type="button"
          onClick={more}
          disabled={pending}
          className="mt-4 w-full rounded-xl border border-glass-brd bg-glass py-2.5 text-sm text-text-1 hover:border-cyan/60 disabled:opacity-60"
        >
          {pending ? "Загружаю…" : "Показать ещё"}
        </button>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-magenta">
          {error}
        </p>
      )}
    </div>
  );
}
