"use client";

import { useState } from "react";
import type { BlogAuthorFeedResponse, BlogPostDto } from "@vedamatch/shared";
import { BlogApiError, fetchBlogAuthorFeed } from "@/lib/blog-client-api";
import { BlogComposer } from "./blog-composer";
import { BlogPostCard } from "./blog-post-card";

/**
 * Лента одного автора — личный блог (VED-116). Форма нового поста стоит
 * только в своём блоге: писать в чужой нельзя, и пустая форма там читалась
 * бы как предложение это сделать.
 */
export function BlogAuthorFeed({
  initial,
  authorId,
  mine,
}: {
  initial: BlogAuthorFeedResponse;
  authorId: string;
  mine: boolean;
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
      const page = await fetchBlogAuthorFeed(authorId, cursor);
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
      {mine && (
        <BlogComposer
          onPublished={(post) => setPosts((current) => [post, ...current])}
        />
      )}

      {posts.length === 0 ? (
        <p className="rounded-2xl border border-glass-brd bg-glass px-4 py-8 text-center text-sm text-text-1">
          {mine
            ? "Здесь появятся ваши посты. Напишите первый — его увидят все в ленте портала."
            : "Участник пока ничего не написал."}
        </p>
      ) : (
        <div className="space-y-4">
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
