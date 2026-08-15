import Link from "next/link";
import type { MarketSectionDto } from "@vedamatch/shared";
import type { Locale } from "@/lib/locale";

/** Горизонтальная лента разделов каталога. Прокручивается на телефоне —
 *  десять разделов в столбик заняли бы весь первый экран. */
export function SectionStrip({
  sections,
  locale,
  activeSlug,
  allLabel,
}: {
  sections: MarketSectionDto[];
  locale: Locale;
  activeSlug?: string;
  allLabel: string;
}) {
  if (sections.length === 0) return null;

  return (
    <nav className="mb-4 -mx-4 overflow-x-auto px-4">
      <ul className="flex w-max gap-2">
        <li>
          <Link
            href="/market"
            aria-current={activeSlug ? undefined : "page"}
            className={chipClass(!activeSlug)}
          >
            {allLabel}
          </Link>
        </li>
        {sections.map((section) => {
          const active = section.slug === activeSlug;
          return (
            <li key={section.id}>
              <Link
                href={`/market/${section.slug}`}
                aria-current={active ? "page" : undefined}
                className={chipClass(active)}
              >
                {locale === "en" ? section.titleEn : section.titleRu}
                <span className="ml-1.5 text-xs opacity-60">
                  {section.listingsCount}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function chipClass(active: boolean): string {
  return [
    "inline-flex items-center whitespace-nowrap rounded-xl border px-3 py-1.5 text-sm transition-colors",
    active
      ? "border-glass-brd bg-glass-brd/50 text-text-0"
      : "border-glass-brd text-text-2 hover:text-text-0",
  ].join(" ");
}
