import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyMarketShop } from "@/lib/market-api";
import { MarketNav } from "@/components/market/market-nav";
import { ShopForm } from "@/components/market/shop-form";
import { navLabels } from "../../labels";

export default async function MarketNewShopPage() {

  const [t, shop] = await Promise.all([
    getTranslations("Market"),
    getMyMarketShop(),
  ]);
  // Магазин один на пользователя: со вторым заходом на эту страницу
  // отправляем в настройки существующего, а не в форму, которая упадёт с 409.
  if (shop) redirect("/market/sell/edit");

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
      <h1 className="mb-6 font-display text-2xl font-bold text-text-0">
        {t("sell.createTitle")}
      </h1>
      <MarketNav active="sell" labels={navLabels(t)} />
      <ShopForm />
    </main>
  );
}
