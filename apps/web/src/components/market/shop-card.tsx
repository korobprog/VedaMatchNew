import Link from "next/link";
import { MapPin, Star } from "lucide-react";
import type { MarketShopSummary } from "@vedamatch/shared";

export function ShopCard({
  shop,
  labels,
}: {
  shop: MarketShopSummary;
  labels: { listings: string; reviews: string };
}) {
  return (
    <Link
      href={`/market/shops/${shop.slug}`}
      className="glass flex items-center gap-3 rounded-2xl border border-glass-brd p-4 transition-colors hover:border-magenta/40"
    >
      {shop.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- логотип в нашем S3
        <img
          src={shop.logoUrl}
          alt=""
          loading="lazy"
          className="h-14 w-14 shrink-0 rounded-xl border border-glass-brd object-cover"
        />
      ) : (
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-glass-brd font-display text-xl text-text-2">
          {shop.name.slice(0, 1).toUpperCase()}
        </span>
      )}

      <div className="min-w-0">
        <h3 className="truncate font-medium text-text-0">{shop.name}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-2">
          <span>{labels.listings.replace("{count}", String(shop.listingsCount))}</span>
          {shop.city && (
            <span className="inline-flex items-center gap-1">
              <MapPin aria-hidden className="h-3 w-3" />
              {shop.city}
            </span>
          )}
          {/* Рейтинг показываем только когда он на чём-то основан: «0,0» у
              новой витрины читается как плохая оценка, а не как её отсутствие. */}
          {shop.reviewsCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <Star aria-hidden className="h-3 w-3 fill-gold text-gold" />
              {shop.ratingAvg.toFixed(1)}
              <span className="opacity-70">
                ({shop.reviewsCount})
              </span>
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
