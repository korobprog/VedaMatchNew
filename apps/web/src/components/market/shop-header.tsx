import Link from "next/link";
import { MapPin, Pencil, Star } from "lucide-react";
import type { MarketShopDto } from "@vedamatch/shared";
import type { Locale } from "@/lib/locale";

export function ShopHeader({
  shop,
  locale,
  labels,
}: {
  shop: MarketShopDto;
  locale: Locale;
  labels: {
    listings: string;
    reviews: string;
    since: string;
    closed: string;
    edit: string;
    contacts: string;
  };
}) {
  const tagline =
    (locale === "en" ? shop.taglineEn : shop.taglineRu) ??
    shop.taglineRu ??
    shop.taglineEn;
  const about =
    (locale === "en" ? shop.aboutEn : shop.aboutRu) ?? shop.aboutRu ?? shop.aboutEn;
  const messengers = Object.entries(shop.messengers ?? {}).filter(
    ([, value]) => Boolean(value),
  );

  return (
    <header className="mb-6">
      {shop.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- обложка в нашем S3
        <img
          src={`${shop.coverUrl}?v=${encodeURIComponent(shop.createdAt)}`}
          alt=""
          className="mb-4 h-40 w-full rounded-2xl border border-glass-brd object-cover"
        />
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:gap-4">
        <div className="flex items-start gap-3 sm:gap-4">
          {shop.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- логотип в нашем S3
            <img
              src={`${shop.logoUrl}?v=${encodeURIComponent(shop.createdAt)}`}
              alt=""
              className="h-16 w-16 shrink-0 rounded-2xl border border-glass-brd object-cover"
            />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-glass-brd font-display text-2xl text-text-2">
              {shop.name.slice(0, 1).toUpperCase()}
            </span>
          )}

          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-bold text-text-0">
              {shop.name}
            </h1>
            {tagline && <p className="text-text-1">{tagline}</p>}

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-2">
              <span>
                {labels.listings.replace(
                  "{count}",
                  String(shop.listingsCount),
                )}
              </span>
              {shop.city && (
                <span className="inline-flex items-center gap-1">
                  <MapPin aria-hidden className="h-3 w-3" />
                  {[shop.city, shop.country].filter(Boolean).join(", ")}
                </span>
              )}
              {shop.reviewsCount > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Star aria-hidden className="h-3 w-3 fill-gold text-gold" />
                  {shop.ratingAvg.toFixed(1)}
                  <span className="opacity-70">({shop.reviewsCount})</span>
                </span>
              )}
              <span>
                {labels.since.replace(
                  "{date}",
                  new Date(shop.createdAt).toLocaleDateString(locale),
                )}
              </span>
            </div>
          </div>
        </div>

        {shop.canEdit && (
          <Link
            href="/market/sell/edit"
            className="inline-flex items-center gap-1.5 self-start rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-2 hover:text-text-0 sm:ml-auto"
          >
            <Pencil aria-hidden className="h-4 w-4" />
            {labels.edit}
          </Link>
        )}
      </div>

      {shop.status !== "active" && (
        <p className="mt-3 rounded-xl border border-glass-brd bg-glass-brd/30 px-3 py-2 text-sm text-text-1">
          {labels.closed}
        </p>
      )}

      {about && (
        <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-text-1">
          {about}
        </p>
      )}

      {/* Оплата и доставка обсуждаются вне платформы, поэтому контакты продавца
          на витрине — не украшение, а основной способ сделки. */}
      {messengers.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-text-2">{labels.contacts}:</span>
          {messengers.map(([key, value]) => (
            <span
              key={key}
              className="rounded-full border border-glass-brd px-2 py-0.5 text-text-1"
            >
              {key}: {String(value)}
            </span>
          ))}
        </div>
      )}
    </header>
  );
}
