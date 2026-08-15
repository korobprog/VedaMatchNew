import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getProfile } from "@/lib/api";
import { getMarketOrder, getMarketOrderReview } from "@/lib/market-api";
import { getServerLocale } from "@/i18n/get-locale";
import { Header } from "@/components/header";
import { MarketNav } from "@/components/market/market-nav";
import { OrderStatusActions } from "@/components/market/order-status-actions";
import { formatPriceMinor } from "@/components/market/price";
import { ReviewForm } from "@/components/market/review-form";
import { StartChatButton } from "@/components/market/start-chat-button";
import { navLabels } from "../../labels";

export default async function MarketOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getProfile();
  if (!user) redirect("/login");

  const { id } = await params;
  const [t, locale, order, review] = await Promise.all([
    getTranslations("Market"),
    getServerLocale(),
    getMarketOrder(id),
    getMarketOrderReview(id),
  ]);
  if (!order) notFound();

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
        <h1 className="mb-2 font-display text-2xl font-bold text-text-0">
          {t("orders.number", { number: order.number })}
        </h1>
        <p className="mb-6 text-sm text-text-2">
          {t("orders.createdAt", {
            date: new Date(order.createdAt).toLocaleDateString(locale),
          })}{" "}
          · {t(`orders.status.${order.status}`)}
        </p>
        <MarketNav active="orders" labels={navLabels(t)} />

        <section className="glass mb-4 rounded-2xl border border-glass-brd p-4">
          <h2 className="mb-3 text-sm font-semibold text-text-0">
            {t("orders.items")}
          </h2>
          <ul className="space-y-2">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 text-sm">
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- картинка в нашем S3
                  <img
                    src={item.imageUrl}
                    alt=""
                    loading="lazy"
                    className="h-12 w-12 shrink-0 rounded-xl border border-glass-brd object-cover"
                  />
                ) : (
                  <span className="h-12 w-12 shrink-0 rounded-xl border border-glass-brd" />
                )}
                <span className="min-w-0 flex-1">
                  {/* Название — снимок на момент заявки. Ссылка есть, только
                      пока объявление живо. */}
                  {item.listingId ? (
                    <Link
                      href={`/market/listing/${item.listingId}`}
                      className="text-text-0 hover:underline"
                    >
                      {item.titleSnapshot}
                    </Link>
                  ) : (
                    <span className="text-text-1">{item.titleSnapshot}</span>
                  )}
                  <span className="ml-2 text-text-2">× {item.quantity}</span>
                </span>
                <span className="text-text-1">
                  {formatPriceMinor(item.lineTotalMinor, item.currency)}
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-3 border-t border-glass-brd pt-3 text-right text-sm text-text-1">
            {t("orders.total")}:{" "}
            <span className="font-display font-semibold text-text-0">
              {formatPriceMinor(order.totalMinor, order.currency)}
            </span>
          </p>
        </section>

        <section className="glass mb-4 rounded-2xl border border-glass-brd p-4 text-sm">
          <dl className="space-y-2">
            <Row label={t("listing.seller")}>
              <Link
                href={`/market/shops/${order.shop.slug}`}
                className="text-text-0 hover:underline"
              >
                {order.shop.name}
              </Link>
            </Row>
            {order.buyer && (
              <Row label={t("orders.buyer")}>
                <span className="text-text-0">{order.buyer.name}</span>
              </Row>
            )}
            {order.deliveryOption && (
              <Row label={t("listing.deliveryTitle")}>
                <span className="text-text-1">
                  {t(`delivery.${order.deliveryOption}`)}
                </span>
              </Row>
            )}
            {order.deliveryNote && (
              <Row label={t("orders.deliveryNote")}>
                <span className="text-text-1">{order.deliveryNote}</span>
              </Row>
            )}
            {order.buyerComment && (
              <Row label={t("orders.comment")}>
                <span className="whitespace-pre-line text-text-1">
                  {order.buyerComment}
                </span>
              </Row>
            )}
            {order.declineReason && (
              <Row label={t("orders.declineReason")}>
                <span className="text-text-1">{order.declineReason}</span>
              </Row>
            )}
          </dl>

          <div className="mt-4">
            <StartChatButton
              shopId={order.shop.id}
              orderId={order.id}
              existingConversationId={order.conversationId}
              label={t("orders.openChat")}
            />
          </div>
        </section>

        <OrderStatusActions
          orderId={order.id}
          transitions={order.availableTransitions}
        />

        {/* Отзыв оставляет только покупатель и только по завершённой сделке;
            продавцу здесь показывать нечего. */}
        {order.viewerRole === "buyer" && (
          <div className="mt-4">
            <ReviewForm
              orderId={order.id}
              existing={review}
              canReview={order.status === "completed"}
            />
          </div>
        )}
      </main>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="text-text-2">{label}:</dt>
      <dd>{children}</dd>
    </div>
  );
}
