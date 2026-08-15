import Link from "next/link";
import { MapPin } from "lucide-react";
import type { MarketListingSummary } from "@vedamatch/shared";
import type { Locale } from "@/lib/locale";
import { FavoriteButton } from "./favorite-button";
import { Price, type PriceLabels } from "./price";

export interface ListingCardLabels extends PriceLabels {
  addToFavorites: string;
  removeFromFavorites: string;
  soldOut: string;
  unavailable: string;
  kindService: string;
}

/** Заголовок на языке интерфейса, с откатом на второй: объявление обязано
 *  иметь название хотя бы на одном языке, но не обязано на обоих. */
export function listingTitle(
  listing: Pick<MarketListingSummary, "titleRu" | "titleEn">,
  locale: Locale,
): string {
  const primary = locale === "en" ? listing.titleEn : listing.titleRu;
  return primary ?? listing.titleEn ?? listing.titleRu ?? "";
}

export function ListingCard({
  listing,
  locale,
  labels,
}: {
  listing: MarketListingSummary;
  locale: Locale;
  labels: ListingCardLabels;
}) {
  const title = listingTitle(listing, locale);

  return (
    <article className="glass relative flex flex-col overflow-hidden rounded-2xl border border-glass-brd">
      <Link
        href={`/market/listing/${listing.id}`}
        className="block overflow-hidden border-b border-glass-brd bg-bg-1"
      >
        {listing.primaryImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- картинка в нашем S3
          <img
            src={listing.primaryImageUrl}
            alt={title}
            loading="lazy"
            className="aspect-square w-full object-cover"
          />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center text-text-2">
            <span className="font-display text-3xl opacity-40">
              {title.slice(0, 1).toUpperCase()}
            </span>
          </div>
        )}
      </Link>

      <div className="absolute right-2 top-2">
        <FavoriteButton
          listingId={listing.id}
          initial={listing.favorited}
          labels={{
            add: labels.addToFavorites,
            remove: labels.removeFromFavorites,
          }}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-glass-brd bg-bg-0/70 text-text-2 backdrop-blur transition-colors hover:text-magenta disabled:opacity-50"
        />
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <Price price={listing.price} labels={labels} />
          {listing.kind === "service" && (
            <span className="rounded-full border border-glass-brd px-2 py-0.5 text-[11px] text-text-2">
              {labels.kindService}
            </span>
          )}
        </div>

        <h3 className="line-clamp-2 text-sm font-medium text-text-0">
          <Link href={`/market/listing/${listing.id}`} className="hover:underline">
            {title}
          </Link>
        </h3>

        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-2">
          <Link
            href={`/market/shops/${listing.shop.slug}`}
            className="truncate hover:text-text-0"
          >
            {listing.shop.name}
          </Link>
          {listing.city && (
            <span className="inline-flex items-center gap-1">
              <MapPin aria-hidden className="h-3 w-3" />
              {listing.city}
            </span>
          )}
        </div>

        {!listing.available && (
          <p className="text-xs text-text-2">
            {listing.status === "sold_out" ? labels.soldOut : labels.unavailable}
          </p>
        )}
      </div>
    </article>
  );
}
