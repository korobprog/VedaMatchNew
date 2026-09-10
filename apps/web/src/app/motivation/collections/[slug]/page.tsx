import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { redirectToLogin } from "@/lib/require-user";
import { needsWelcome } from "@/lib/welcome";
import { Header } from "@/components/header";
import { MotivationTopBar } from "@/components/motivation/motivation-top-bar";
import { MotivationCollectionGrid } from "@/components/motivation/collections-view";
import { getProfile } from "@/lib/api";
import {
  getMotivationCategories,
  getMotivationFeed,
} from "@/lib/motivation-api";
import {
  COLLECTION_VIEWS,
  collectionEmptyText,
  collectionImageSource,
  collectionViewHref,
  isStoryView,
  parseCollectionView,
} from "@/components/motivation/folder-view";

/** Карточки одной папки — сеткой картинок. */
export default async function MotivationCollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { slug } = await params;
  /* Вид папки живёт в адресе, как и сама папка: из плитки уходят в ленту и
     возвращаются кнопкой «назад», а состояние, которого нет в ссылке, при
     этом теряется молча. Разбор — в folder-view.ts, там же и старый
     ?view=story. */
  const view = parseCollectionView((await searchParams).view);
  const [user, categories, feed] = await Promise.all([
    getProfile(),
    getMotivationCategories(),
    getMotivationFeed(
      "all",
      undefined,
      undefined,
      slug,
      collectionImageSource(view),
    ),
  ]);
  if (!user) redirectToLogin(`/motivation/collections/${slug}`);
  if (needsWelcome(user)) redirect("/welcome");

  const category = (categories ?? []).find((item) => item.slug === slug);
  if (!category) notFound();
  const isAdmin = user.role === "admin" || user.role === "service-admin";
  const children = (categories ?? []).filter(
    (item) => item.parentId === category.id,
  );

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-2 py-4 pb-24 sm:px-4">
        <MotivationTopBar
          active="collections"
          isAdmin={isAdmin}
          title={category.title}
          action={{ href: "/motivation/collections", label: "Все подборки" }}
          count={category.postCount}
        />
        <div className="mt-4 space-y-4 px-2">
          {children.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {children.map((child) => (
                <li key={child.id}>
                  {/* Пустая подкатегория видна, но не кликается: за ней тупик
                      со словами «пока пусто», а ноль рядом с названием говорит
                      то же самое, не заставляя туда идти. Так же и в списке
                      всех подборок. */}
                  {child.postCount > 0 ? (
                    <Link
                      href={`/motivation/collections/${child.slug}`}
                      className="glass inline-flex items-center gap-1.5 rounded-full border border-glass-brd px-3 py-1.5 text-sm text-text-1 hover:text-text-0"
                    >
                      {child.title}
                      <span className="font-mono text-xs text-text-2">
                        {child.postCount}
                      </span>
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-glass-brd px-3 py-1.5 text-sm text-text-2">
                      {child.title}
                      <span className="font-mono text-xs">
                        {child.postCount}
                      </span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {/* Три вида одной папки: иллюстрации отвечают на «про что это»,
              а оформленные афоризмы — на «что отсюда можно переслать», и
              разведены по происхождению картинки. Просили именно те, что
              наложены на фотографии людьми: в общей куче с работой нейросети
              их не различить. Переключатель ссылками, а не кнопкой: вид
              уезжает в адрес, им делятся и на него возвращаются «назад». */}
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Вид папки"
          >
            {COLLECTION_VIEWS.map((option) => (
              <Link
                key={option.id}
                href={collectionViewHref(slug, option.id)}
                aria-current={option.id === view ? "true" : undefined}
                className="glass rounded-full border border-glass-brd px-3 py-1.5 text-sm text-text-1 hover:text-text-0 aria-[current=true]:border-cyan aria-[current=true]:text-text-0"
              >
                {option.label}
              </Link>
            ))}
          </div>
          <MotivationCollectionGrid
            posts={feed?.items ?? []}
            category={slug}
            variant={isStoryView(view) ? "story" : "image"}
            empty={collectionEmptyText(view)}
          />
        </div>
      </main>
    </div>
  );
}
