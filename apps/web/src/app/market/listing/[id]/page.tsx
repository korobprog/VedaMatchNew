import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MapPin, Pencil } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getProfile } from "@/lib/api";
import { getMarketListing, getMarketListingComments } from "@/lib/market-api";
import { getServerLocale } from "@/i18n/get-locale";
import { Header } from "@/components/header";
import { priceLabels } from "@/components/market/labels";
import { AddToCartButton } from "@/components/market/add-to-cart-button";
import { CommentList } from "@/components/market/comment-list";
import { FavoriteButton } from "@/components/market/favorite-button";
import { ReportButton } from "@/components/market/report-dialog";
import { StartChatButton } from "@/components/market/start-chat-button";
import { ListingGallery } from "@/components/market/listing-gallery";
import { listingTitle } from "@/components/market/listing-card";
import { MarketNav } from "@/components/market/market-nav";
import { Price } from "@/components/market/price";
import { navLabels } from "../../labels";

export default async function MarketListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getProfile();
  if (!user) redirect("/login");

  const { id } = await params;
  const [t, locale, listing, comments] = await Promise.all([
    getTranslations("Market"),
    getServerLocale(),
    getMarketListing(id),
    getMarketListingComments(id),
  ]);
  if (!listing) notFound();

  const title = listingTitle(listing, locale);
  const description =
    (locale === "en" ? listing.descriptionEn : listing.descriptionRu) ??
    listing.descriptionRu ??
    listing.descriptionEn;

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-5xl px-4 py-8 pb-24">
        <MarketNav active="catalog" labels={navLabels(t)} />

        <div className="grid gap-6 md:grid-cols-2">
          <ListingGallery images={listing.images} alt={title} />

          <div>
            <div className="mb-2 flex items-center gap-2 text-xs text-text-2">
              <span className="rounded-full border border-glass-brd px-2 py-0.5">
                {listing.kind === "service"
                  ? t("listing.kindService")
                  : t("listing.kindProduct")}
              </span>
              {listing.condition && (
                <span>{t(`condition.${listing.condition}`)}</span>
              )}
              {listing.serviceFormat && (
                <span>{t(`serviceFormat.${listing.serviceFormat}`)}</span>
              )}
            </div>

            <h1 className="font-display text-2xl font-bold text-text-0">
              {title}
            </h1>

            <div className="mt-3 flex items-center gap-3">
              <Price
                price={listing.price}
                labels={priceLabels(t)}
                className="font-display text-2xl font-bold text-text-0"
              />
              <FavoriteButton
                listingId={listing.id}
                initial={listing.favorited}
                labels={{
                  add: t("favorites.add"),
                  remove: t("favorites.remove"),
                }}
              />
            </div>

            {/* Свой товар не заказывают и себе не пишут — обе кнопки прячем
                у владельца, а не показываем неработающими. */}
            {!listing.canEdit && (
              <div className="mt-4 flex flex-wrap gap-2">
                <AddToCartButton
                  listingId={listing.id}
                  disabled={!listing.available}
                />
                <StartChatButton
                  shopId={listing.shop.id}
                  listingId={listing.id}
                  label={t("orders.openChat")}
                />
                <ReportButton
                  targetKind="listing"
                  targetId={listing.id}
                  className="self-center"
                />
              </div>
            )}

            <ul className="mt-4 space-y-1 text-sm text-text-1">
              {listing.trackStock && listing.quantity !== null && (
                <li>
                  {t("listing.inStock", { count: listing.quantity })}
                </li>
              )}
              {listing.status === "sold_out" && <li>{t("listing.soldOut")}</li>}
              {listing.serviceDurationMinutes !== null && (
                <li>
                  {t("listing.duration", {
                    minutes: listing.serviceDurationMinutes,
                  })}
                </li>
              )}
              {listing.city && (
                <li className="inline-flex items-center gap-1">
                  <MapPin aria-hidden className="h-3.5 w-3.5" />
                  {[listing.city, listing.country].filter(Boolean).join(", ")}
                </li>
              )}
              <li className="text-text-2">
                {t("listing.views", { count: listing.viewsCount })}
              </li>
            </ul>

            {listing.deliveryOptions.length > 0 && (
              <section className="mt-4">
                <h2 className="mb-1 text-sm font-semibold text-text-0">
                  {t("listing.deliveryTitle")}
                </h2>
                <ul className="flex flex-wrap gap-2">
                  {listing.deliveryOptions.map((option) => (
                    <li
                      key={option}
                      className="rounded-full border border-glass-brd px-2 py-0.5 text-xs text-text-2"
                    >
                      {t(`delivery.${option}`)}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="glass mt-4 rounded-2xl border border-glass-brd p-4">
              <h2 className="mb-2 text-sm font-semibold text-text-0">
                {t("listing.seller")}
              </h2>
              <Link
                href={`/market/shops/${listing.shop.slug}`}
                className="flex items-center gap-3 hover:text-text-0"
              >
                {listing.shop.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- логотип в нашем S3
                  <img
                    src={listing.shop.logoUrl}
                    alt=""
                    className="h-10 w-10 rounded-xl border border-glass-brd object-cover"
                  />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-glass-brd text-text-2">
                    {listing.shop.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="text-sm text-text-0">{listing.shop.name}</span>
                <span className="ml-auto text-xs text-text-2">
                  {t("listing.goToShop")}
                </span>
              </Link>
            </section>

            {listing.canEdit && (
              <Link
                href={`/market/sell/listings/${listing.id}`}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-2 hover:text-text-0"
              >
                <Pencil aria-hidden className="h-4 w-4" />
                {t("sell.editListing")}
              </Link>
            )}
          </div>
        </div>

        {description && (
          <section className="mt-8">
            <h2 className="mb-2 font-display text-lg font-semibold text-text-0">
              {t("listing.description")}
            </h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-text-1">
              {description}
            </p>
          </section>
        )}

        {listing.categories.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold text-text-0">
              {t("listing.categories")}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {listing.categories.map((category) => (
                <li key={category.id}>
                  <Link
                    href={`/market/${category.sectionSlug}/${category.slug}`}
                    className="rounded-full border border-glass-brd px-3 py-1 text-xs text-text-2 hover:text-text-0"
                  >
                    {locale === "en" ? category.titleEn : category.titleRu}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {comments && (
          <CommentList
            listingId={listing.id}
            initial={comments}
            locale={locale}
          />
        )}
      </main>
    </div>
  );
}
