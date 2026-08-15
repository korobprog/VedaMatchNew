import Link from "next/link";
import type { MarketShopStatsDto } from "@vedamatch/shared";

/** Панель статистики витрины. Конверсия показана в процентах: доля вида
 *  «0.05» на дашборде читается хуже, чем «5%». */
export function ShopStatsPanel({
  stats,
  labels,
}: {
  stats: MarketShopStatsDto;
  labels: {
    title: string;
    published: string;
    views: string;
    favorites: string;
    orders: string;
    conversion: string;
    top: string;
    empty: string;
  };
}) {
  const tiles = [
    { label: labels.published, value: String(stats.listingsPublished) },
    { label: labels.views, value: String(stats.viewsTotal) },
    { label: labels.favorites, value: String(stats.favoritesTotal) },
    { label: labels.orders, value: String(stats.ordersTotal) },
    {
      label: labels.conversion,
      value: `${Math.round(stats.conversion * 100)}%`,
    },
  ];

  return (
    <section className="glass rounded-2xl border border-glass-brd p-5">
      <h2 className="mb-3 font-display text-lg font-semibold text-text-0">
        {labels.title}
      </h2>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-xl border border-glass-brd px-3 py-2"
          >
            <dt className="text-xs text-text-2">{tile.label}</dt>
            <dd className="font-display text-xl font-semibold text-text-0">
              {tile.value}
            </dd>
          </div>
        ))}
      </dl>

      <h3 className="mb-2 mt-4 text-sm font-semibold text-text-0">{labels.top}</h3>
      {stats.topListings.length === 0 ? (
        <p className="text-sm text-text-2">{labels.empty}</p>
      ) : (
        <ul className="space-y-1">
          {stats.topListings.map((listing) => (
            <li
              key={listing.id}
              className="flex items-center gap-2 rounded-xl border border-glass-brd px-3 py-2 text-sm"
            >
              <Link
                href={`/market/sell/listings/${listing.id}`}
                className="min-w-0 flex-1 truncate text-text-0 hover:underline"
              >
                {listing.title}
              </Link>
              <span className="shrink-0 text-xs text-text-2">
                {listing.viewsCount} · {listing.favoritesCount} ·{" "}
                {listing.ordersCount}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
