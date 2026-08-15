import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getProfile } from "@/lib/api";
import {
  getMarketCategories,
  getMarketListings,
  getMarketSections,
} from "@/lib/market-api";
import { getServerLocale } from "@/i18n/get-locale";
import { Header } from "@/components/header";
import { CategoryNav } from "@/components/market/category-nav";
import { listingGridLabels } from "@/components/market/labels";
import { ListingFilters } from "@/components/market/listing-filters";
import { ListingGrid } from "@/components/market/listing-grid";
import { MarketNav } from "@/components/market/market-nav";
import { SectionStrip } from "@/components/market/section-strip";
import { filterLabels, navLabels } from "../../labels";

export default async function MarketCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string; category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getProfile();
  if (!user) redirect("/login");

  const { section: sectionSlug, category: categorySlug } = await params;
  const query = await searchParams;
  const [t, locale, sections, categories, feed] = await Promise.all([
    getTranslations("Market"),
    getServerLocale(),
    getMarketSections(),
    getMarketCategories(sectionSlug),
    getMarketListings({ ...query, categorySlug }),
  ]);

  const section = sections?.find((item) => item.slug === sectionSlug);
  const category = categories?.find((item) => item.slug === categorySlug);
  if (!section || !category) notFound();

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-6xl px-4 py-8 pb-24">
        <p className="text-sm text-text-2">
          {locale === "en" ? section.titleEn : section.titleRu}
        </p>
        <h1 className="mb-6 font-display text-2xl font-bold text-text-0">
          {locale === "en" ? category.titleEn : category.titleRu}
        </h1>

        <MarketNav active="catalog" labels={navLabels(t)} />
        <SectionStrip
          sections={sections ?? []}
          locale={locale}
          activeSlug={sectionSlug}
          allLabel={t("filters.anySection")}
        />
        <CategoryNav
          categories={categories ?? []}
          sectionSlug={sectionSlug}
          locale={locale}
          activeSlug={categorySlug}
          allLabel={t("filters.anyCategory")}
        />
        <ListingFilters
          labels={filterLabels(t)}
          categories={categories ?? []}
          locale={locale}
        />

        {feed && (
          <ListingGrid
            initialFeed={feed}
            locale={locale}
            query={{ ...query, categorySlug }}
            labels={listingGridLabels(t)}
          />
        )}
      </main>
    </div>
  );
}
