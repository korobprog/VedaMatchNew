import Link from "next/link";
import { Star } from "lucide-react";
import { redirect } from "next/navigation";
import { canAdminService } from "@vedamatch/shared";
import { getBlogFavorites, getBlogFeed, getBlogSettings } from "@/lib/blog-api";
import { requireUser } from "@/lib/require-user";
import { BlogFeed } from "@/components/blog/blog-feed";
import { BlogSettingsForm } from "@/components/blog/blog-settings-form";
import { PostActionsOrderButton } from "@/components/blog/post-actions-order-button";
import {
  blogFeedHref,
  parseBlogFeedFilters,
} from "@/components/blog/blog-feed-filters";

export const metadata = {
  title: "Блог-лента — что происходит на портале",
  description:
    "Посты участников с фотографиями и роликами: что происходит прямо сейчас, и весь архив прошлых постов.",
  // Лента с именами и фотографиями людей не должна попадать в поисковики.
  robots: { index: false, follow: false },
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Полная лента (VED-238): «При нажатии на это окно должна открываться полная
 * лента со всеми прошлыми постами» — поэтому здесь `scope=all`, с постами,
 * которые уже вышли из ленты главной по сроку.
 *
 * Вкладка «Избранное» — посты, отмеченные звёздочкой (VED-238). `?new=1`
 * ставит курсор в форму нового поста: туда ведёт карандаш с главной.
 * `?category=` и `?lineage=` — фильтры читателя (VED-590, VED-596).
 */
export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // Старые ссылки из скопированных постов вели на `/blog?post=…`, а страница
  // этот параметр не читала. Теперь у поста свой адрес.
  const postId = first(params.post);
  if (postId) redirect(`/blog/posts/${encodeURIComponent(postId)}`);

  const user = await requireUser();
  const favorites = first(params.view) === "favorites";
  const compose = first(params.new) === "1";
  const isAdmin = canAdminService(
    { role: user.role, adminServices: user.adminServices },
    "blog",
  );
  const filters = parseBlogFeedFilters(params);
  const [feed, settings] = await Promise.all([
    favorites ? getBlogFavorites(filters) : getBlogFeed("all", filters),
    isAdmin && !favorites ? getBlogSettings() : Promise.resolve(null),
  ]);

  const tab =
    "inline-flex min-h-11 items-center rounded-lg border px-3 text-sm";
  // Вкладки не сбрасывают фильтры: «Новости» во «Всех постах» остаются
  // «Новостями» и в «Избранном».
  const allHref = blogFeedHref("/blog", "", filters);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 pb-28">
      <div className="mb-4">
        <h1 className="font-display text-2xl font-bold text-text-0 sm:text-3xl">
          Блог-лента
        </h1>
        <p className="mt-1 text-sm text-text-1">
          Что происходит у людей портала прямо сейчас. Здесь же лежат все
          прошлые посты — те, что уже ушли из ленты на главной.
        </p>
      </div>

      {/* Вкладки и «Создать новый пост» — одной строкой (VED-519): форма и
          настройки срока свёрнуты в кнопку справа от вкладок. */}
      <BlogFeed
        key={`${favorites ? "favorites" : "all"}:${filters.category ?? ""}:${
          filters.lineage ?? ""
        }`}
        initial={feed ?? { posts: [], nextCursor: null }}
        scope={favorites ? "favorites" : "all"}
        showComposer={!favorites}
        autoFocusComposer={compose}
        nav={
          <nav aria-label="Разделы ленты" className="flex gap-1.5 sm:gap-2">
            <Link
              href={allHref}
              aria-current={favorites ? undefined : "page"}
              className={`${tab} ${
                favorites
                  ? "border-glass-brd text-text-1 hover:border-cyan/60"
                  : "border-cyan bg-bg-1 font-semibold text-text-0"
              }`}
            >
              Все посты
            </Link>
            {/* «Избранное» — звёздочкой (VED-650): ряд вкладок, фильтров и
                «+» встаёт в одну строку и на телефоне. */}
            <Link
              href={blogFeedHref("/blog", "view=favorites", filters)}
              aria-current={favorites ? "page" : undefined}
              aria-label="Избранное"
              title="Избранное"
              className={`${tab} ${
                favorites
                  ? "border-gold bg-bg-1 text-gold"
                  : "border-glass-brd text-text-1 hover:border-gold/60"
              }`}
            >
              <Star
                aria-hidden
                className="size-5"
                fill={favorites ? "currentColor" : "none"}
              />
            </Link>
            {/* Порядок кнопок под постами (VED-650) — здесь, рядом с
                «Избранным», а не на странице поста. */}
            <PostActionsOrderButton />
          </nav>
        }
        beforeComposer={settings && <BlogSettingsForm initial={settings} />}
        filters={filters}
      />
    </main>
  );
}
