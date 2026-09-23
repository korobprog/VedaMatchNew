"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { EyeOff, Images, PenLine, Play, Rows3, Star } from "lucide-react";
import type { BlogHomeFeedResponse, BlogPostDto } from "@vedamatch/shared";
import {
  BLOG_HOME_COOKIE,
  BLOG_HOME_COOKIE_MAX_AGE,
  serializeBlogHomeVisible,
} from "@/lib/blog-home-visibility";
import { BlogApiError, fetchBlogFavorites } from "@/lib/blog-client-api";
import { BlogCarousel, BlogFrame } from "./blog-carousel";
import {
  blogHomeAspect,
  blogHomeSlide,
  type BlogHomeSlide,
} from "./blog-media-list";

/**
 * Блог-лента на главной (VED-238) — на месте, где раньше стояли карточка
 * поддержки и строка поиска.
 *
 * «Вид блог-ленты на главной — верхняя панель, картинка, заголовок. Всё»
 * (чек-лист карточки). Поэтому:
 *
 * - картинка во всю ширину виджета и целиком, без обрезки: посты листаются
 *   каруселью по одному, как в Instagram, а не мелкой плиткой;
 * - под картинкой только заголовок: ни автора, ни даты — они «сжирают место»
 *   и остаются в развороте поста;
 * - «вся лента и прошлые посты» — не надпись снизу, а кнопка в верхней
 *   панели рядом с «написать» и «скрыть», и там же четвёртая — «Избранное»;
 * - нажатие на картинку или заголовок открывает этот пост, а не ленту.
 *
 * Кнопка «Скрыть» пишет cookie и перерисовывает главную на сервере: в
 * спрятанном виде виджета нет вовсе, и главная выглядит как раньше. Вернуть
 * ленту можно кнопкой в строке настроек над сеткой сервисов.
 */
export function BlogHomeWidget({
  data,
  userId,
  className,
}: {
  data: BlogHomeFeedResponse;
  userId: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  /**
   * «Избранное» переключает содержимое виджета на отмеченные посты, а не
   * уводит со страницы: «чтобы они отображались в ленте по нажатии на неё».
   * Загружается при первом нажатии — главной незачем тянуть его заранее.
   */
  const [showFavorites, setShowFavorites] = useState(false);
  const [favorites, setFavorites] = useState<BlogPostDto[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function hide() {
    document.cookie = `${BLOG_HOME_COOKIE}=${serializeBlogHomeVisible(
      userId,
      false,
    )}; path=/; max-age=${BLOG_HOME_COOKIE_MAX_AGE}; samesite=lax`;
    startTransition(() => router.refresh());
  }

  async function toggleFavorites() {
    const next = !showFavorites;
    setShowFavorites(next);
    setError(null);
    if (!next || favorites !== null) return;
    setLoading(true);
    try {
      setFavorites((await fetchBlogFavorites()).posts);
    } catch (cause) {
      setError(
        cause instanceof BlogApiError
          ? cause.message
          : "Не удалось загрузить избранное.",
      );
    } finally {
      setLoading(false);
    }
  }

  const slides = useMemo(
    () => (showFavorites ? (favorites ?? []) : data.posts).map(blogHomeSlide),
    [showFavorites, favorites, data.posts],
  );
  const aspect = blogHomeAspect(slides);

  /* 44px — размер пальца: четыре кнопки панели стоят вплотную, и мелкие
     промахивались бы на соседнюю — а соседняя здесь «убрать ленту». */
  const iconButton =
    "inline-flex size-11 items-center justify-center rounded-lg border border-glass-brd text-text-1";

  return (
    <section
      aria-labelledby="blog-home-heading"
      className={`overflow-hidden rounded-2xl border border-glass-brd bg-glass ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 py-1.5 pl-3 pr-1.5">
        <h2
          id="blog-home-heading"
          className="font-display text-sm font-semibold text-text-0"
        >
          {showFavorites ? "Избранное" : "Блог-лента"}
        </h2>
        <div className="flex items-center gap-1">
          <Link
            href="/blog?new=1"
            aria-label="Написать пост"
            title="Написать пост"
            className={`${iconButton} hover:border-cyan/60`}
          >
            <PenLine aria-hidden className="size-4" />
          </Link>
          <Link
            href="/blog"
            aria-label="Вся лента и прошлые посты"
            title="Вся лента и прошлые посты"
            className={`${iconButton} hover:border-cyan/60`}
          >
            <Rows3 aria-hidden className="size-4" />
          </Link>
          <button
            type="button"
            onClick={toggleFavorites}
            aria-pressed={showFavorites}
            aria-label="Избранное"
            title="Избранное"
            className={`${iconButton} hover:border-gold/60 ${
              showFavorites ? "border-gold" : ""
            }`}
          >
            <Star
              aria-hidden
              className={`size-4 ${showFavorites ? "fill-gold text-gold" : ""}`}
            />
          </button>
          <button
            type="button"
            onClick={hide}
            disabled={pending}
            aria-label="Убрать ленту с экрана"
            title="Убрать ленту с экрана"
            className={`${iconButton} hover:border-magenta/60 disabled:opacity-60`}
          >
            <EyeOff aria-hidden className="size-4" />
          </button>
        </div>
      </div>

      {/* Итог переключения — вслух: содержимое виджета сменилось на месте. */}
      <p role="status" className="sr-only">
        {showFavorites && !loading && favorites
          ? `Избранное: ${favorites.length}`
          : ""}
      </p>

      {error ? (
        <p role="alert" className="px-3 pb-3 text-xs text-magenta">
          {error}
        </p>
      ) : loading ? (
        <p className="px-3 pb-3 text-sm text-text-1">Загружаю избранное…</p>
      ) : slides.length === 0 ? (
        <Link
          href={showFavorites ? "/blog" : "/blog?new=1"}
          className="mx-3 mb-3 block rounded-xl border border-glass-brd bg-bg-1 px-3 py-4 text-sm text-text-1"
        >
          {showFavorites
            ? "В избранном пока пусто. Отметьте пост звёздочкой в ленте — он появится здесь."
            : "В ленте пока пусто. Напишите первый пост — его увидят все."}
        </Link>
      ) : (
        <BlogCarousel
          key={showFavorites ? "favorites" : "feed"}
          count={slides.length}
          label={showFavorites ? "Избранные посты" : "Посты блог-ленты"}
          perView="responsive"
          renderSlide={(index) => (
            <HomeSlide slide={slides[index]} aspect={aspect} />
          )}
        />
      )}
    </section>
  );
}

/**
 * Картинка и заголовок — одной ссылкой на пост: один переход по Tab на
 * слайд, и нажатие куда угодно по нему открывает тот же разворот.
 *
 * Заголовок под картинкой, а не поверх неё: картинку «должно быть видно
 * полностью». Высота заголовка постоянная, на две строки, — у слайдов с
 * коротким и длинным заголовком одна высота, и карусель не прыгает.
 */
function HomeSlide({ slide, aspect }: { slide: BlogHomeSlide; aspect: number }) {
  return (
    <Link
      href={`/blog/posts/${encodeURIComponent(slide.id)}`}
      className="group block focus-visible:outline-offset-[-3px]"
    >
      <BlogFrame aspect={aspect}>
        {slide.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={slide.coverUrl}
            alt=""
            className="size-full object-contain"
          />
        ) : (
          <span className="flex size-full items-center justify-center px-6 text-center text-sm leading-6 text-text-1">
            {slide.frameText}
          </span>
        )}
        {slide.isVideo && (
          <span
            aria-hidden
            className="absolute left-1/2 top-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-bg-0/85 text-text-0"
          >
            <Play className="ml-0.5 size-6 fill-current" />
          </span>
        )}
        {slide.mediaCount > 1 && (
          <span
            aria-hidden
            className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-bg-0/85 px-2 py-0.5 text-[11px] font-semibold text-text-0"
          >
            <Images className="size-3" />
            {slide.mediaCount}
          </span>
        )}
      </BlogFrame>
      <span className="flex h-14 items-center px-3">
        {slide.title && (
          <span className="line-clamp-2 font-display text-sm font-semibold leading-snug text-text-0 group-hover:underline">
            {slide.title}
          </span>
        )}
        {/* У ссылки обязано быть имя: пост из одной фотографии без слов
            иначе читается скринридером как пустая ссылка. */}
        <span className="sr-only">
          {slide.title
            ? slide.isVideo
              ? ", ролик"
              : ""
            : slide.coverUrl
              ? slide.isVideo
                ? "Пост с роликом"
                : "Пост с фотографией"
              : ""}
        </span>
      </span>
    </Link>
  );
}
