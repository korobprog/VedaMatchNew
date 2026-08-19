import Link from "next/link";
import { redirect } from "next/navigation";
import { redirectToLogin } from "@/lib/require-user";
import { getTranslations } from "next-intl/server";
import { getProfile } from "@/lib/api";
import { getMarketShopListings, getMyMarketShop } from "@/lib/market-api";
import { getServerLocale } from "@/i18n/get-locale";
import { Header } from "@/components/header";
import { priceLabels } from "@/components/market/labels";
import { listingTitle } from "@/components/market/listing-card";
import { MarketNav } from "@/components/market/market-nav";
import { Price } from "@/components/market/price";
import { navLabels } from "../../labels";

export default async function MarketSellListingsPage() {
  const user = await getProfile();
  if (!user) redirectToLogin("/market/sell/listings");

  const [t, locale, shop] = await Promise.all([
    getTranslations("Market"),
    getServerLocale(),
    getMyMarketShop(),
  ]);
  if (!shop) redirect("/market/sell/new");

  // Своя витрина глазами владельца: сюда попадают и черновики, и скрытое —
  // API отдаёт их, потому что запрос идёт от владельца магазина.
  const feed = await getMarketShopListings(shop.slug);

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-4xl px-4 py-8 pb-24">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-bold text-text-0">
            {t("sell.listings")}
          </h1>
          <Link
            href="/market/sell/listings/new"
            className="rounded-xl bg-glass-brd/40 px-4 py-2 text-sm text-text-0 hover:bg-glass-brd/60"
          >
            {t("sell.newListing")}
          </Link>
        </div>
        <MarketNav active="sell" labels={navLabels(t)} />

        {!feed || feed.items.length === 0 ? (
          <p className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
            {t("shop.empty")}
          </p>
        ) : (
          <ul className="space-y-2">
            {feed.items.map((listing) => (
              <li
                key={listing.id}
                className="glass flex items-center gap-3 rounded-2xl border border-glass-brd p-3"
              >
                {listing.primaryImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- картинка в нашем S3
                  <img
                    src={listing.primaryImageUrl}
                    alt=""
                    loading="lazy"
                    className="h-14 w-14 shrink-0 rounded-xl border border-glass-brd object-cover"
                  />
                ) : (
                  <span className="h-14 w-14 shrink-0 rounded-xl border border-glass-brd" />
                )}

                <div className="min-w-0 flex-1">
                  <Link
                    href={`/market/sell/listings/${listing.id}`}
                    className="block truncate text-sm text-text-0 hover:underline"
                  >
                    {listingTitle(listing, locale)}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-text-2">
                    <Price
                      price={listing.price}
                      labels={priceLabels(t)}
                      className="text-xs text-text-1"
                    />
                    <span>{statusLabel(t, listing.status)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function statusLabel(t: (key: string) => string, status: string): string {
  if (status === "draft") return t("sell.draft");
  if (status === "sold_out") return t("listing.soldOut");
  if (status === "published") return t("sell.statusActive");
  return t("listing.unavailable");
}
