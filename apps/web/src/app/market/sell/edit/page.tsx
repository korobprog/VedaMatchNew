import { redirect } from "next/navigation";
import { redirectToLogin } from "@/lib/require-user";
import { getTranslations } from "next-intl/server";
import { getProfile } from "@/lib/api";
import { getMarketShopShelves, getMyMarketShop } from "@/lib/market-api";
import { Header } from "@/components/header";
import { MarketNav } from "@/components/market/market-nav";
import { ShelfManager } from "@/components/market/shelf-manager";
import { ShopForm } from "@/components/market/shop-form";
import { ShopImageUpload } from "@/components/market/shop-image-upload";
import { navLabels } from "../../labels";

export default async function MarketEditShopPage() {
  const user = await getProfile();
  if (!user) redirectToLogin("/market/sell/edit");

  const [t, shop] = await Promise.all([
    getTranslations("Market"),
    getMyMarketShop(),
  ]);
  if (!shop) redirect("/market/sell/new");

  const shelves = (await getMarketShopShelves(shop.slug)) ?? [];

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
        <h1 className="mb-6 font-display text-2xl font-bold text-text-0">
          {t("sell.edit")}
        </h1>
        <MarketNav active="sell" labels={navLabels(t)} />

        <div className="glass mb-4 rounded-2xl border border-glass-brd p-5">
          <ShopImageUpload shopId={shop.id} kind="logo" currentUrl={shop.logoUrl} />
          <ShopImageUpload shopId={shop.id} kind="cover" currentUrl={shop.coverUrl} />
        </div>

        <div className="mb-4">
          <ShopForm shop={shop} />
        </div>

        <ShelfManager shopId={shop.id} shelves={shelves} />
      </main>
    </div>
  );
}
