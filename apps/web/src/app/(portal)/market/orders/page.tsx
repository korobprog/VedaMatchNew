import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getMarketOrders } from "@/lib/market-api";
import { getServerLocale } from "@/i18n/get-locale";
import { template } from "@/components/market/labels";
import { MarketNav } from "@/components/market/market-nav";
import { OrderCard } from "@/components/market/order-card";
import { navLabels } from "../labels";

export default async function MarketOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {

  const params = await searchParams;
  const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
  const role = roleParam === "seller" ? "seller" : "buyer";

  const [t, locale, orders] = await Promise.all([
    getTranslations("Market"),
    getServerLocale(),
    getMarketOrders({ role }),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 pb-24">
      <h1 className="mb-6 font-display text-2xl font-bold text-text-0">
        {role === "seller" ? t("orders.sellerTitle") : t("orders.title")}
      </h1>
      <MarketNav active="orders" labels={navLabels(t)} />

      {/* Две роли живут на одной странице: заявки покупателя и продавца —
          это одни и те же сущности, только с разных сторон. */}
      <div className="mb-4 flex gap-2">
        <RoleTab href="/market/orders" active={role === "buyer"}>
          {t("orders.title")}
        </RoleTab>
        <RoleTab href="/market/orders?role=seller" active={role === "seller"}>
          {t("orders.sellerTitle")}
        </RoleTab>
      </div>

      {!orders || orders.items.length === 0 ? (
        <p className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
          {t("orders.empty")}
        </p>
      ) : (
        <div className="space-y-3">
          {orders.items.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              locale={locale}
              labels={{
                number: template(t, "orders.number"),
                createdAt: template(t, "orders.createdAt"),
                total: t("orders.total"),
                status: t(`orders.status.${order.status}`),
              }}
            />
          ))}
        </div>
      )}
    </main>
  );
}

function RoleTab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={[
        "rounded-xl border px-3 py-1.5 text-sm transition-colors",
        active
          ? "border-glass-brd bg-glass-brd/50 text-text-0"
          : "border-glass-brd text-text-2 hover:text-text-0",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}
