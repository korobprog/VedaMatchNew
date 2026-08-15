import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getProfile } from "@/lib/api";
import { getMarketShopStats, getMyMarketShop } from "@/lib/market-api";
import { getServerLocale } from "@/i18n/get-locale";
import { Header } from "@/components/header";
import { shopLabels } from "@/components/market/labels";
import { MarketNav } from "@/components/market/market-nav";
import { ShopHeader } from "@/components/market/shop-header";
import { ShopStatsPanel } from "@/components/market/shop-stats-panel";
import { navLabels } from "../labels";

export default async function MarketSellPage() {
  const user = await getProfile();
  if (!user) redirect("/login");

  const [t, locale, shop] = await Promise.all([
    getTranslations("Market"),
    getServerLocale(),
    getMyMarketShop(),
  ]);

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-5xl px-4 py-8 pb-24">
        <h1 className="mb-6 font-display text-2xl font-bold text-text-0">
          {t("sell.title")}
        </h1>
        <MarketNav active="sell" labels={navLabels(t)} />

        {!shop ? (
          <div className="glass rounded-2xl border border-glass-brd p-8 text-center">
            <p className="mb-4 text-text-1">{t("sell.noShop")}</p>
            <Link
              href="/market/sell/new"
              className="inline-block rounded-xl bg-glass-brd/40 px-4 py-2 text-sm text-text-0 hover:bg-glass-brd/60"
            >
              {t("sell.createCta")}
            </Link>
          </div>
        ) : (
          <>
            <ShopHeader
              shop={shop}
              locale={locale}
              labels={shopLabels(t)}
            />

            <div className="mb-6 flex flex-wrap gap-2">
              <Link
                href="/market/orders?role=seller"
                className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-2 hover:text-text-0"
              >
                {t("orders.sellerTitle")}
              </Link>
              <Link
                href="/market/sell/listings"
                className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-2 hover:text-text-0"
              >
                {t("sell.listings")}
              </Link>
              <Link
                href="/market/sell/listings/new"
                className="rounded-xl bg-glass-brd/40 px-4 py-2 text-sm text-text-0 hover:bg-glass-brd/60"
              >
                {t("sell.newListing")}
              </Link>
              <Link
                href={`/market/shops/${shop.slug}`}
                className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-2 hover:text-text-0"
              >
                {t("listing.goToShop")}
              </Link>
            </div>

            <ShopStats shopId={shop.id} />
          </>
        )}
      </main>
    </div>
  );
}

async function ShopStats({ shopId }: { shopId: string }) {
  const [t, stats] = await Promise.all([
    getTranslations("Market"),
    getMarketShopStats(shopId),
  ]);
  if (!stats) return null;

  return (
    <ShopStatsPanel
      stats={stats}
      labels={{
        title: t("stats.title"),
        published: t("stats.published"),
        views: t("stats.views"),
        favorites: t("stats.favorites"),
        orders: t("stats.orders"),
        conversion: t("stats.conversion"),
        top: t("stats.top"),
        empty: t("stats.empty"),
      }}
    />
  );
}
