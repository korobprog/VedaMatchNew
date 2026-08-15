import Link from "next/link";
import type { MarketCategoryDto } from "@vedamatch/shared";
import type { Locale } from "@/lib/locale";

/** Категории раздела. Пустые не прячем: продавцу важно видеть, что рубрика
 *  существует и в неё можно подать объявление. */
export function CategoryNav({
  categories,
  sectionSlug,
  locale,
  activeSlug,
  allLabel,
}: {
  categories: MarketCategoryDto[];
  sectionSlug: string;
  locale: Locale;
  activeSlug?: string;
  allLabel: string;
}) {
  if (categories.length === 0) return null;

  return (
    <nav className="mb-4 flex flex-wrap gap-2">
      <Link
        href={`/market/${sectionSlug}`}
        aria-current={activeSlug ? undefined : "page"}
        className={chipClass(!activeSlug)}
      >
        {allLabel}
      </Link>
      {categories.map((category) => {
        const active = category.slug === activeSlug;
        return (
          <Link
            key={category.id}
            href={`/market/${sectionSlug}/${category.slug}`}
            aria-current={active ? "page" : undefined}
            className={chipClass(active)}
          >
            {locale === "en" ? category.titleEn : category.titleRu}
            {category.listingsCount > 0 && (
              <span className="ml-1.5 text-xs opacity-60">
                {category.listingsCount}
              </span>
            )}
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
