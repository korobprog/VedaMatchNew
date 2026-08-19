import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  getMarketShop,
  getMarketShopListings,
  getMarketShopReviews,
  getMarketShopShelves,
  getMarketSubscriptions,
} from "@/lib/market-api";
import { getServerLocale } from "@/i18n/get-locale";
import { listingGridLabels, shopLabels, template } from "@/components/market/labels";
import { ListingGrid } from "@/components/market/listing-grid";
import { MarketNav } from "@/components/market/market-nav";
import { ReportButton } from "@/components/market/report-dialog";
import { ReviewList } from "@/components/market/review-list";
import { ShelfNav } from "@/components/market/shelf-nav";
import { ShopHeader } from "@/components/market/shop-header";
import { SubscribeButton } from "@/components/market/subscribe-button";
import { navLabels } from "../../labels";

export default async function MarketShopPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {

  const { slug } = await params;
  const query = await searchParams;
  const [t, locale, shop, shelves, feed, reviews, subscriptions] =
    await Promise.all([
      getTranslations("Market"),
      getServerLocale(),
      getMarketShop(slug),
      getMarketShopShelves(slug),
      getMarketShopListings(slug, query),
      getMarketShopReviews(slug),
      getMarketSubscriptions(),
    ]);
  if (!shop) notFound();

  const subscription =
    subscriptions?.find(
      (item) => item.kind === "shop" && item.shopSlug === slug,
    ) ?? null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 pb-24">
      <MarketNav active="shops" labels={navLabels(t)} />
      <ShopHeader
        shop={shop}
        locale={locale}
        labels={shopLabels(t)}
      />

      {/* Свою витрину не отслеживают и на себя не жалуются. */}
      {!shop.canEdit && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <SubscribeButton
            kind="shop"
            shopId={shop.id}
            existing={subscription}
          />
          <ReportButton targetKind="shop" targetId={shop.id} />
        </div>
      )}

      <ShelfNav
        shelves={shelves ?? []}
        shopSlug={slug}
        locale={locale}
        allLabel={t("shop.allShelves")}
      />

      {feed && (
        <ListingGrid
          initialFeed={feed}
          locale={locale}
          query={query}
          labels={{ ...listingGridLabels(t), empty: t("shop.empty") }}
          endpoint={`/market/shops/${encodeURIComponent(slug)}/listings`}
        />
      )}

      {reviews && (
        <ReviewList
          reviews={reviews}
          locale={locale}
          labels={{
            title: t("reviews.title"),
            empty: t("reviews.empty"),
            average: t("reviews.average"),
            count: template(t, "reviews.count"),
          }}
        />
      )}
    </main>
  );
}
