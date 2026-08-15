import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getProfile } from "@/lib/api";
import { getMarketListings, getMarketSections } from "@/lib/market-api";
import { getServerLocale } from "@/i18n/get-locale";
import { Header } from "@/components/header";
import { listingGridLabels } from "@/components/market/labels";
import { ListingFilters } from "@/components/market/listing-filters";
import { ListingGrid } from "@/components/market/listing-grid";
import { MarketNav } from "@/components/market/market-nav";
import { SectionStrip } from "@/components/market/section-strip";
import { filterLabels, navLabels } from "./labels";

export const metadata: Metadata = {
  title: "Рынок — VedaMatch",
  description:
    "Объявления и услуги в благости: товары, книги, мастерские и помощь",
};

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getProfile();
  if (!user) redirect("/login");

  const params = await searchParams;
  const [t, locale, sections, feed] = await Promise.all([
    getTranslations("Market"),
    getServerLocale(),
    getMarketSections(),
    getMarketListings(params),
  ]);

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-6xl px-4 py-8 pb-24">
        <h1 className="font-display text-2xl font-bold text-text-0">
          {t("title")}
        </h1>
        <p className="mb-6 text-text-1">{t("subtitle")}</p>

        <MarketNav active="catalog" labels={navLabels(t)} />
        <SectionStrip
          sections={sections ?? []}
          locale={locale}
          allLabel={t("filters.anySection")}
          variant="tiles"
        />
        <ListingFilters labels={filterLabels(t)} categories={[]} locale={locale} />

        {feed && (
          <ListingGrid
            initialFeed={feed}
            locale={locale}
            query={params}
            labels={listingGridLabels(t)}
          />
        )}
      </main>
    </div>
  );
}
