import { getTranslations } from "next-intl/server";
import { redirectToLogin } from "@/lib/require-user";
import { getProfile } from "@/lib/api";
import { getMarketFavorites } from "@/lib/market-api";
import { getServerLocale } from "@/i18n/get-locale";
import { Header } from "@/components/header";
import { listingGridLabels } from "@/components/market/labels";
import { ListingGrid } from "@/components/market/listing-grid";
import { MarketNav } from "@/components/market/market-nav";
import { navLabels } from "../labels";

export default async function MarketFavoritesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getProfile();
  if (!user) redirectToLogin("/market/favorites");

  const params = await searchParams;
  const [t, locale, feed] = await Promise.all([
    getTranslations("Market"),
    getServerLocale(),
    getMarketFavorites(params),
  ]);

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-6xl px-4 py-8 pb-24">
        <h1 className="mb-6 font-display text-2xl font-bold text-text-0">
          {t("favorites.title")}
        </h1>
        <MarketNav active="favorites" labels={navLabels(t)} />

        {feed && (
          <ListingGrid
            initialFeed={feed}
            locale={locale}
            query={params}
            labels={{
              ...listingGridLabels(t),
              empty: t("favorites.empty"),
              emptyHint: t("listing.emptyHint"),
            }}
            endpoint="/market/favorites"
          />
        )}
      </main>
    </div>
  );
}
