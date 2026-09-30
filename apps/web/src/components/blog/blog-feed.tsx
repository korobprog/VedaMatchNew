"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, Plus, Search } from "lucide-react";
import type { BlogFeedResponse, BlogPostDto } from "@vedamatch/shared";
import {
  BlogApiError,
  fetchBlogFavorites,
  fetchBlogFeed,
} from "@/lib/blog-client-api";
import { BlogComposer } from "./blog-composer";
import {
  BlogCategoryFilter,
  BlogLineageFilter,
} from "./blog-feed-filter-menus";
import type { BlogFeedFilterValues } from "./blog-feed-filters";
import { BlogSearchForm } from "./blog-search";
import { BLOG_ICON_BUTTON } from "./blog-menu";
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
  filters,
  searchOpen = false,
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
  /**
   * Фильтры читателя из адреса (VED-590, VED-596). Есть — в ряду кнопок
   * встают значки «Категории постов» и «Фильтр по организациям», и «Показать
   * ещё» догружает с теми же фильтрами.
   */
  filters?: BlogFeedFilterValues;
  /** Поиск раскрыт сразу — `?search=1`, кнопка «Поиск» с главной (VED-687). */
  searchOpen?: boolean;
}) {
  const [composing, setComposing] = useState(autoFocusComposer);
  const [searching, setSearching] = useState(
    searchOpen || Boolean(filters?.q || filters?.author),
  );
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
          ? await fetchBlogFavorites(cursor, filters)
          : await fetchBlogFeed(scope, cursor, filters);
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
        {filters && (
          <>
            <button
              type="button"
              onClick={() => setSearching((open) => !open)}
              aria-expanded={searching}
              aria-label="Поиск по блог-ленте"
              title="Поиск по блог-ленте"
              className={`inline-flex size-11 items-center justify-center rounded-lg border ${
                searching || filters.q || filters.author
                  ? "border-cyan bg-bg-1 text-text-0"
                  : "border-glass-brd text-text-1 hover:border-cyan/60"
              }`}
            >
              <Search aria-hidden className="size-4" />
            </button>
            <BlogCategoryFilter value={filters.category} />
            <BlogLineageFilter value={filters.lineage} />
          </>
        )}
        {showComposer && (
          /* Одна кнопка на оба состояния: сменись она другим элементом,
             клавиатура после нажатия осталась бы ни на чём. Открытая форма
             сворачивается значком-стрелкой в том же ряду (VED-633): кнопка-
             надпись «Свернуть» в ряд не вставала и уезжала на отдельную
             строку над формой. */
          <button
            type="button"
            onClick={() => setComposing((open) => !open)}
            aria-expanded={composing}
            aria-controls="blog-compose"
            aria-label={composing ? "Свернуть форму поста" : "Новый пост"}
            title={composing ? "Свернуть" : "Новый пост"}
            /* «Новый пост» — значком «+» без заливки (VED-648): в своём ряду
               кнопок, а не отдельной зелёной плашкой строкой ниже. */
            className={`${BLOG_ICON_BUTTON} border-glass-brd text-text-1 hover:border-cyan/60 hover:text-text-0`}
          >
            {composing ? (
              <ChevronDown aria-hidden className="size-5" />
            ) : (
              <Plus aria-hidden className="size-5" />
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

      {filters && searching && <BlogSearchForm filters={filters} />}

      {posts.length === 0 ? (
        <p className="rounded-2xl border border-glass-brd bg-glass px-4 py-8 text-center text-sm text-text-1">
          {filters && (filters.q || filters.author)
            ? "По такому запросу постов нет. Попробуйте другое слово или имя."
            : filters && (filters.category || filters.lineage)
              ? "С такими фильтрами постов нет. Выберите другую категорию или линию."
              : scope === "favorites"
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
