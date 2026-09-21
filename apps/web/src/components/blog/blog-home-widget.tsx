"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { EyeOff, PenLine } from "lucide-react";
import type { BlogHomeFeedResponse } from "@vedamatch/shared";
import {
  BLOG_HOME_COOKIE,
  BLOG_HOME_COOKIE_MAX_AGE,
  serializeBlogHomeVisible,
} from "@/lib/blog-home-visibility";
import { plural } from "@/lib/plural";
import { blogPostDate } from "./blog-format";

/**
 * Блог-лента на главной (VED-238) — на месте, где раньше стояли карточка
 * поддержки и строка поиска.
 *
 * Показывает начало ленты, а не всю: вся лента живёт на `/blog`, и нажатие
 * на любой пост или на подпись «смотреть всё» ведёт туда. Картинка первой
 * и крупно, заголовок под ней — по чек-листу карточки.
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

  function hide() {
    document.cookie = `${BLOG_HOME_COOKIE}=${serializeBlogHomeVisible(
      userId,
      false,
    )}; path=/; max-age=${BLOG_HOME_COOKIE_MAX_AGE}; samesite=lax`;
    startTransition(() => router.refresh());
  }

  const rest = Math.max(0, data.total - data.posts.length);

  return (
    <section
      aria-labelledby="blog-home-heading"
      className={`rounded-2xl border border-glass-brd bg-glass p-3 ${className ?? ""}`}
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h2
          id="blog-home-heading"
          className="font-display text-sm font-semibold text-text-0"
        >
          Блог-лента
        </h2>
        <div className="flex items-center gap-1">
          <Link
            href="/blog"
            aria-label="Написать пост"
            className="rounded-lg border border-glass-brd p-1.5 text-text-1 hover:border-cyan/60"
          >
            <PenLine aria-hidden className="size-4" />
          </Link>
          <button
            type="button"
            onClick={hide}
            disabled={pending}
            aria-label="Убрать ленту с экрана"
            className="rounded-lg border border-glass-brd p-1.5 text-text-1 hover:border-magenta/60 disabled:opacity-60"
          >
            <EyeOff aria-hidden className="size-4" />
          </button>
        </div>
      </div>

      {data.posts.length === 0 ? (
        <Link
          href="/blog"
          className="block rounded-xl border border-glass-brd bg-bg-1 px-3 py-4 text-sm text-text-1"
        >
          В ленте пока пусто. Напишите первый пост — его увидят все.
        </Link>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {data.posts.map((post) => {
              // У репоста своих картинок и заголовка обычно нет — в плитке
              // показываем оригинал, иначе на главной висит серый квадрат
              // «Без заголовка» вместо того, что человек переслал.
              const shown = post.repostOf ?? post;
              return (
              <li key={post.id}>
                <Link
                  href={`/blog?post=${encodeURIComponent(post.id)}`}
                  className="group block overflow-hidden rounded-xl border border-glass-brd bg-bg-1 hover:border-cyan/60"
                >
                  {shown.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={shown.images[0].url}
                      alt=""
                      className="aspect-square w-full bg-bg-2 object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="flex aspect-square w-full items-center justify-center bg-bg-2 px-2 text-center text-xs text-text-2"
                    >
                      {shown.text.slice(0, 60) || shown.title}
                    </span>
                  )}
                  <span className="block px-2 py-1.5">
                    <span className="line-clamp-2 text-xs font-semibold leading-snug text-text-0">
                      {shown.title ??
                        (shown.text.slice(0, 60) || "Без заголовка")}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-text-2">
                      {post.author.name} · {blogPostDate(post.createdAt)}
                    </span>
                  </span>
                </Link>
              </li>
              );
            })}
          </ul>
          <Link
            href="/blog"
            className="mt-2 block text-center text-xs text-text-1 underline underline-offset-4 hover:text-text-0"
          >
            {rest > 0
              ? `Вся лента — и ещё ${rest} ${plural(rest, "пост", "поста", "постов")}`
              : "Вся лента и прошлые посты"}
          </Link>
        </>
      )}
    </section>
  );
}
