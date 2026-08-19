import { getTranslations } from "next-intl/server";
import { redirectToLogin } from "@/lib/require-user";
import { getProfile } from "@/lib/api";
import { getMarketShops } from "@/lib/market-api";
import { Header } from "@/components/header";
import { template } from "@/components/market/labels";
import { MarketNav } from "@/components/market/market-nav";
import { ShopCard } from "@/components/market/shop-card";
import { navLabels } from "../labels";

export default async function MarketShopsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getProfile();
  if (!user) redirectToLogin("/market/shops");

  const params = await searchParams;
  const [t, shops] = await Promise.all([
    getTranslations("Market"),
    getMarketShops(params),
  ]);

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-5xl px-4 py-8 pb-24">
        <h1 className="mb-6 font-display text-2xl font-bold text-text-0">
          {t("nav.shops")}
        </h1>
        <MarketNav active="shops" labels={navLabels(t)} />

        {!shops || shops.items.length === 0 ? (
          <p className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
            {t("shop.directoryEmpty")}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {shops.items.map((shop) => (
              <ShopCard
                key={shop.id}
                shop={shop}
                labels={{
                  listings: template(t, "shop.listingsCount"),
                  reviews: template(t, "shop.reviews"),
                }}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
