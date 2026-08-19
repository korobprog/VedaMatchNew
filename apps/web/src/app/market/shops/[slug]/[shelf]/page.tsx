import { notFound } from "next/navigation";
import { redirectToLogin } from "@/lib/require-user";
import { getTranslations } from "next-intl/server";
import { getProfile } from "@/lib/api";
import {
  getMarketShop,
  getMarketShopListings,
  getMarketShopShelves,
} from "@/lib/market-api";
import { getServerLocale } from "@/i18n/get-locale";
import { Header } from "@/components/header";
import { listingGridLabels, shopLabels } from "@/components/market/labels";
import { ListingGrid } from "@/components/market/listing-grid";
import { MarketNav } from "@/components/market/market-nav";
import { ShelfNav } from "@/components/market/shelf-nav";
import { ShopHeader } from "@/components/market/shop-header";
import { navLabels } from "../../../labels";

export default async function MarketShelfPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; shelf: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getProfile();
  if (!user) {
    const { slug, shelf } = await params;
    redirectToLogin(`/market/shops/${slug}/${shelf}`);
  }

  const { slug, shelf: shelfSlug } = await params;
  const query = await searchParams;
  const [t, locale, shop, shelves, feed] = await Promise.all([
    getTranslations("Market"),
    getServerLocale(),
    getMarketShop(slug),
    getMarketShopShelves(slug),
    getMarketShopListings(slug, { ...query, shelfSlug }),
  ]);
  if (!shop) notFound();
  if (!shelves?.some((item) => item.slug === shelfSlug)) notFound();

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-6xl px-4 py-8 pb-24">
        <MarketNav active="shops" labels={navLabels(t)} />
        <ShopHeader
          shop={shop}
          locale={locale}
          labels={shopLabels(t)}
        />

        <ShelfNav
          shelves={shelves}
          shopSlug={slug}
          locale={locale}
          activeSlug={shelfSlug}
          allLabel={t("shop.allShelves")}
        />

        {feed && (
          <ListingGrid
            initialFeed={feed}
            locale={locale}
            query={{ ...query, shelfSlug }}
            labels={{ ...listingGridLabels(t), empty: t("shop.empty") }}
            endpoint={`/market/shops/${encodeURIComponent(slug)}/listings`}
          />
        )}
      </main>
    </div>
  );
}
