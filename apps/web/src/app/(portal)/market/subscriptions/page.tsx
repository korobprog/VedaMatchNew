import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getMarketSubscriptions } from "@/lib/market-api";
import { getServerLocale } from "@/i18n/get-locale";
import { buildMarketQuery } from "@/lib/market-query";
import { MarketNav } from "@/components/market/market-nav";
import { SubscribeButton } from "@/components/market/subscribe-button";
import { navLabels } from "../labels";

export default async function MarketSubscriptionsPage() {

  const [t, locale, subscriptions] = await Promise.all([
    getTranslations("Market"),
    getServerLocale(),
    getMarketSubscriptions(),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
      <h1 className="mb-6 font-display text-2xl font-bold text-text-0">
        {t("subscriptions.title")}
      </h1>
      <MarketNav active="subscriptions" labels={navLabels(t)} />

      {!subscriptions || subscriptions.length === 0 ? (
        <div className="glass rounded-2xl border border-glass-brd p-8 text-center">
          <p className="text-text-1">{t("subscriptions.empty")}</p>
          <p className="mt-1 text-sm text-text-2">
            {t("subscriptions.emptyHint")}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {subscriptions.map((subscription) => {
            // Каждая подписка ведёт туда, откуда её завели: магазин — на
            // витрину, поиск — в каталог с теми же фильтрами.
            const href =
              subscription.kind === "shop" && subscription.shopSlug
                ? `/market/shops/${subscription.shopSlug}`
                : subscription.kind === "category" &&
                    subscription.sectionSlug &&
                    subscription.categorySlug
                  ? `/market/${subscription.sectionSlug}/${subscription.categorySlug}`
                  : subscription.kind === "section" && subscription.sectionSlug
                    ? `/market/${subscription.sectionSlug}`
                    : `/market${buildMarketQuery(
                        subscription.query as Record<string, string> | undefined,
                      )}`;

            return (
              <li
                key={subscription.id}
                className="glass flex items-center gap-3 rounded-2xl border border-glass-brd p-3"
              >
                <span className="rounded-full border border-glass-brd px-2 py-0.5 text-[11px] text-text-2">
                  {t(`subscriptions.kind.${subscription.kind}`)}
                </span>
                <Link
                  href={href}
                  className="min-w-0 flex-1 truncate text-sm text-text-0 hover:underline"
                >
                  {subscription.title}
                </Link>
                <span className="hidden text-xs text-text-2 sm:inline">
                  {new Date(subscription.createdAt).toLocaleDateString(locale)}
                </span>
                <SubscribeButton
                  kind={subscription.kind}
                  existing={subscription}
                />
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
