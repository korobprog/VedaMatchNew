import Link from "next/link";
import type { MarketShelfDto } from "@vedamatch/shared";
import type { Locale } from "@/lib/locale";

/** Полки витрины — собственная навигация магазина, независимая от каталога. */
export function ShelfNav({
  shelves,
  shopSlug,
  locale,
  activeSlug,
  allLabel,
}: {
  shelves: MarketShelfDto[];
  shopSlug: string;
  locale: Locale;
  activeSlug?: string;
  allLabel: string;
}) {
  if (shelves.length === 0) return null;

  return (
    <nav className="mb-4 flex flex-wrap gap-2">
      <Link
        href={`/market/shops/${shopSlug}`}
        aria-current={activeSlug ? undefined : "page"}
        className={chipClass(!activeSlug)}
      >
        {allLabel}
      </Link>
      {shelves.map((shelf) => {
        const active = shelf.slug === activeSlug;
        const title =
          (locale === "en" ? shelf.titleEn : shelf.titleRu) ??
          shelf.titleRu ??
          shelf.titleEn ??
          shelf.slug;
        return (
          <Link
            key={shelf.id}
            href={`/market/shops/${shopSlug}/${shelf.slug}`}
            aria-current={active ? "page" : undefined}
            className={chipClass(active)}
          >
            {title}
          </Link>
        );
      })}
    </nav>
  );
}

function chipClass(active: boolean): string {
  return [
    "inline-flex items-center rounded-full border px-3 py-1 text-xs transition-colors",
    active
      ? "border-glass-brd bg-glass-brd/50 text-text-0"
      : "border-glass-brd text-text-2 hover:text-text-0",
  ].join(" ");
}
