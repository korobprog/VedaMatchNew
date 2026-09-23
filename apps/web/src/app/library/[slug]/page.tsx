import Link from "next/link";
import { notFound } from "next/navigation";
import { redirectToLogin } from "@/lib/require-user";
import { isLineagePreference, resolveContentLineage } from "@vedamatch/shared";
import { getProfile } from "@/lib/api";
import { LineagePrompt } from "@/components/lineage-prompt";
import {
  getLibraryCategoryPage,
  getLibraryCategoryTree,
  getLibraryCommunities,
  getLibraryFeed,
  getLibraryPreferences,
  getLibraryShlokaList,
} from "@/lib/library-api";
import { Header } from "@/components/header";
import { BackLink } from "@/components/library/back-link";
import { CategoryBreadcrumbs } from "@/components/library/category-breadcrumbs";
import { CategoryNavigator } from "@/components/library/category-navigator";
import { DescendantsToggle } from "@/components/library/descendants-toggle";
import { EntryFilters } from "@/components/library/entry-filters";
import { EntryList } from "@/components/library/entry-list";
import { shlokaSectionMode } from "@/components/library/shloka/shloka-mode";
import { ShlokaRootPanel } from "@/components/library/shloka/shloka-root-panel";
import { ShlokaSourcePanel } from "@/components/library/shloka/shloka-source-panel";
import { st } from "@/components/library/shloka/shloka-text";
import {
  categoryPageSummary,
  pickLocalized,
  t,
} from "@/components/library/i18n";

/**
 * Страница рубрики — одна на все уровни дерева.
 *
 * Адрес плоский: `/library/<slug>` не зависит от места в дереве, поэтому
 * перемещение рубрики не превращает чужие ссылки и закладки в 404. Путь
 * показывают хлебные крошки, а не адресная строка.
 */
export default async function LibraryCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getProfile();
  if (!user) {
    const { slug } = await params;
    redirectToLogin(`/library/${slug}`);
  }

  const { slug } = await params;
  const query = await searchParams;
  // Материалы вложенных рубрик показываем по умолчанию: иначе вложение
  // прятало бы контент — рубрику убрали внутрь, и лента родителя опустела.
  const withDescendants = query.withDescendants !== "false";

  const [page, tree, preferences, communities, shlokas] = await Promise.all([
    getLibraryCategoryPage(slug),
    getLibraryCategoryTree(),
    getLibraryPreferences(),
    getLibraryCommunities(),
    // Шлоки рубрики по порядку стихов (VED-386). Для обычной рубрики —
    // пустой ответ, и страница остаётся прежней.
    getLibraryShlokaList(slug).catch(() => null),
  ]);

  if (!page) notFound();

  const shlokaMode = shlokaSectionMode({
    category: page.category,
    ancestors: page.ancestors,
    shlokaTotal: shlokas?.total ?? 0,
  });
  // В окне источника шлоки стоят списком выше, а лента ниже — остальные
  // материалы раздела, без повтора тех же шлок.
  const feedQuery = {
    ...query,
    categorySlug: slug,
    withDescendants: withDescendants ? "true" : "false",
    ...(shlokaMode === "source" ? { excludeType: "shloka" } : {}),
  };
  const feed = await getLibraryFeed(feedQuery);

  const locale = preferences?.uiLanguage ?? "ru";
  const explicitLineage =
    typeof query.lineage === "string" && isLineagePreference(query.lineage)
      ? query.lineage
      : null;
  const appliedLineage = explicitLineage
    ? resolveContentLineage(null, explicitLineage)
    : resolveContentLineage(user, preferences?.lineage ?? null);
  const { category, ancestors, children } = page;
  const title = pickLocalized(locale, {
    ru: category.titleRu,
    en: category.titleEn,
  });

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-5xl px-4 py-8 pb-24">
        <BackLink locale={locale} fallbackHref="/library" />
        <CategoryBreadcrumbs
          locale={locale}
          ancestors={ancestors}
          current={title}
        />

        <div className="mb-1 flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-display text-2xl font-bold text-text-0">
            {title}
          </h1>
          <Link
            href={`/library/add?category=${encodeURIComponent(category.slug)}`}
            className="btn-mint rounded-xl px-4 py-2 text-sm font-semibold shadow-[0_0_12px_var(--vm-glow-mint)]"
          >
            {t(locale, "nav.add")}
          </Link>
        </div>
        {/* То же одно число, что и в плитке: раздел — свои подразделы,
            подраздел — свои материалы. Голое «3 материалов» над лентой
            раздела, у которого своих материалов нет, читалось как «здесь
            три» — а все три лежали в подразделах. */}
        <p className="mb-6 text-sm text-text-2">
          {categoryPageSummary(locale, category)}
        </p>

        {user && (
          <LineagePrompt
            user={user}
            serviceName="Образования"
            settingsHref="/library#lineage-switch"
            settingsLabel="в списке линий на главной Образования"
          />
        )}

        <CategoryNavigator
          locale={locale}
          categories={children}
          tree={tree ?? []}
          activeSlug={category.slug}
          canOrganize={category.canMove}
        />

        {shlokaMode === "root" && (
          <ShlokaRootPanel
            locale={locale}
            tree={tree ?? []}
            categorySlug={category.slug}
          />
        )}

        {shlokaMode === "source" && shlokas && (
          <ShlokaSourcePanel
            locale={locale}
            categorySlug={category.slug}
            initial={shlokas}
          />
        )}

        {shlokaMode === "source" ? (
          // Прочие материалы раздела — только если они есть: пустая лента
          // под списком шлок читалась бы как «здесь ничего нет».
          feed &&
          feed.total > 0 && (
            <section aria-labelledby="other-materials">
              <h2
                id="other-materials"
                className="mb-3 font-display text-lg font-bold text-text-0"
              >
                {st(locale, "section.otherMaterials")}
              </h2>
              <EntryList
                key={JSON.stringify(feedQuery)}
                initialFeed={feed}
                locale={locale}
                query={feedQuery}
                lineageFiltered={appliedLineage !== null}
              />
            </section>
          )
        ) : (
          <>
            {children.length > 0 && (
              <DescendantsToggle locale={locale} enabled={withDescendants} />
            )}

            <EntryFilters
              locale={locale}
              categories={children}
              communities={communities ?? []}
            />

            {feed && (
              <EntryList
                key={JSON.stringify({ ...query, categorySlug: slug })}
                initialFeed={feed}
                locale={locale}
                query={{ ...query, categorySlug: slug }}
                lineageFiltered={appliedLineage !== null}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
