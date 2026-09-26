"use client";

import { useState, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import type { BlogFeedResponse, BlogPostDto } from "@vedamatch/shared";
import {
  BlogApiError,
  fetchBlogFavorites,
  fetchBlogFeed,
} from "@/lib/blog-client-api";
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
  autoFocusComposer = false,
  nav,
  beforeComposer,
}: {
  initial: BlogFeedResponse;
  /** `favorites` — вкладка «Избранное» (VED-238). */
  scope?: "current" | "all" | "favorites";
  showComposer?: boolean;
  /** Форма раскрыта сразу и в фокусе — `?new=1`, карандаш с главной. */
  autoFocusComposer?: boolean;
  /**
   * Вкладки ленты. Рядом с ними — «Создать новый пост» (VED-519): форма и
   * настройки срока свёрнуты в эту кнопку и не занимают экран над постами.
   */
  nav?: ReactNode;
  /** Над формой, в том же свёрнутом блоке, — настройки срока для админа. */
  beforeComposer?: ReactNode;
}) {
  const [composing, setComposing] = useState(autoFocusComposer);
  const [posts, setPosts] = useState(initial.posts);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function more() {
    if (!cursor) return;
    setPending(true);
    setError(null);
    try {
      const page =
        scope === "favorites"
          ? await fetchBlogFavorites(cursor)
          : await fetchBlogFeed(scope, cursor);
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
      // Во вкладке «Избранное» снятая звёздочка убирает пост из списка сразу:
      // иначе вкладка показывает то, что уже не избранное.
      scope === "favorites" && !post.favorited
        ? current.filter((item) => item.id !== post.id)
        : current.map((item) => (item.id === post.id ? post : item)),
    );
  }

  return (
    <div>
      {/* Зазоры 6px на телефоне: вкладки и «Новый пост» встают в одну
          строку и на 360 точках. */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5 sm:gap-2">
        {nav}
        {showComposer && (
          <button
            type="button"
            onClick={() => setComposing((open) => !open)}
            aria-expanded={composing}
            aria-controls="blog-compose"
            className="btn-mint ml-auto inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold sm:gap-1.5 sm:px-3"
          >
            {composing ? (
              <X aria-hidden className="size-4" />
            ) : (
              <Plus aria-hidden className="size-4" />
            )}
            {/* На телефоне короче: полная подпись с двумя вкладками в строку
                360 точек не встаёт. */}
            {composing ? (
              "Свернуть"
            ) : (
              <>
                <span className="sm:hidden">Новый пост</span>
                <span className="hidden sm:inline">Создать новый пост</span>
              </>
            )}
          </button>
        )}
      </div>

      {showComposer && composing && (
        <div id="blog-compose">
          {beforeComposer}
          <BlogComposer
            autoFocus
            onPublished={(post) => {
              setPosts((current) => [post, ...current]);
              // Опубликовали — форма сворачивается, пост встаёт первым.
              setComposing(false);
            }}
          />
        </div>
      )}

      {posts.length === 0 ? (
        <p className="rounded-2xl border border-glass-brd bg-glass px-4 py-8 text-center text-sm text-text-1">
          {scope === "favorites"
            ? "В избранном пока пусто. Отметьте пост звёздочкой — он появится здесь."
            : "Здесь пока пусто. Напишите первый пост — его увидят все на главной."}
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
