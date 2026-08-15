import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getProfile } from "@/lib/api";
import { getMarketChat } from "@/lib/market-api";
import { getServerLocale } from "@/i18n/get-locale";
import { Header } from "@/components/header";
import { MarketChatPanel } from "@/components/market/market-chat-panel";
import { MarketNav } from "@/components/market/market-nav";
import { navLabels } from "../../labels";

export default async function MarketChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getProfile();
  if (!user) redirect("/login");

  const { id } = await params;
  const [t, locale, state] = await Promise.all([
    getTranslations("Market"),
    getServerLocale(),
    getMarketChat(id),
  ]);
  if (!state) notFound();

  const { chat } = state;
  const title =
    chat.viewerRole === "seller"
      ? (chat.buyer?.name ?? t("chat.withBuyer"))
      : chat.shop.name;

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display text-2xl font-bold text-text-0">{title}</h1>
          <div className="flex gap-3 text-sm">
            <Link
              href={`/market/shops/${chat.shop.slug}`}
              className="text-text-2 hover:text-text-0"
            >
              {t("listing.goToShop")}
            </Link>
            {chat.orderId && (
              <Link
                href={`/market/orders/${chat.orderId}`}
                className="text-text-2 hover:text-text-0"
              >
                {t("orders.title")}
              </Link>
            )}
          </div>
        </div>
        <MarketNav active="chats" labels={navLabels(t)} />

        <MarketChatPanel initial={state} locale={locale} />
      </main>
    </div>
  );
}
