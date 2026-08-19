import { getTranslations } from "next-intl/server";
import { redirectToLogin } from "@/lib/require-user";
import { getProfile } from "@/lib/api";
import { getMarketCart } from "@/lib/market-api";
import { getServerLocale } from "@/i18n/get-locale";
import { Header } from "@/components/header";
import { CartPanel } from "@/components/market/cart-panel";
import { MarketNav } from "@/components/market/market-nav";
import { navLabels } from "../labels";

export default async function MarketCartPage() {
  const user = await getProfile();
  if (!user) redirectToLogin("/market/cart");

  const [t, locale, cart] = await Promise.all([
    getTranslations("Market"),
    getServerLocale(),
    getMarketCart(),
  ]);

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-4xl px-4 py-8 pb-24">
        <h1 className="mb-6 font-display text-2xl font-bold text-text-0">
          {t("cart.title")}
        </h1>
        <MarketNav active="cart" labels={navLabels(t)} />

        {cart && <CartPanel initial={cart} locale={locale} />}
      </main>
    </div>
  );
}
