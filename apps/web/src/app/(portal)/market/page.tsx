import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  getMarketListings,
  getMarketSections,
  getMyMarketShop,
} from "@/lib/market-api";
import { getServerLocale } from "@/i18n/get-locale";
import { listingGridLabels } from "@/components/market/labels";
import { ListingFilters } from "@/components/market/listing-filters";
import { ListingGrid } from "@/components/market/listing-grid";
import { MarketNav } from "@/components/market/market-nav";
import { SectionStrip } from "@/components/market/section-strip";
import { filterLabels, navLabels } from "./labels";

export const metadata: Metadata = {
  title: "Рынок",
  description:
    "Коммерческие объявления и услуги в благости: товары, книги, мастерские и помощь",
};

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {

  const params = await searchParams;
  const [t, locale, sections, feed, shop] = await Promise.all([
    getTranslations("Market"),
    getServerLocale(),
    getMarketSections(),
    getMarketListings(params),
    getMyMarketShop(),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 pb-24">
      <div className="mb-1 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-text-0">
          {t("title")}
        </h1>
        {shop && (
          <Link
            href="/market/sell/listings/new"
            className="btn-mint rounded-xl px-4 py-2 text-sm font-semibold shadow-[0_0_12px_var(--vm-glow-mint)]"
          >
            {t("sell.newListing")}
          </Link>
        )}
      </div>
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
  );
}
