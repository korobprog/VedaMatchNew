import Link from "next/link";
import type { MarketSectionDto } from "@vedamatch/shared";
import type { Locale } from "@/lib/locale";
import { SectionIcon } from "./section-icon";

/**
 * Разделы каталога.
 *
 * Раньше это была горизонтальная лента с прокруткой: на десктопе половина
 * разделов оказывалась за краем, на телефоне их приходилось искать свайпом —
 * то есть главный вход в каталог был спрятан. Теперь ничего не прокручивается:
 * на главной каталога разделы разложены плиткой, на внутренних страницах —
 * компактными фишками с переносом строк.
 */
export function SectionStrip({
  sections,
  locale,
  activeSlug,
  allLabel,
  variant = "chips",
}: {
  sections: MarketSectionDto[];
  locale: Locale;
  activeSlug?: string;
  allLabel: string;
  /** `tiles` — главная каталога, `chips` — раздел и категория. */
  variant?: "tiles" | "chips";
}) {
  if (sections.length === 0) return null;

  const title = (section: MarketSectionDto) =>
    locale === "en" ? section.titleEn : section.titleRu;

  if (variant === "tiles") {
    return (
      <nav className="mb-6">
        {/* Четыре колонки на телефоне: десять разделов укладываются в три
            ряда вместо пяти, и до товаров не нужно пролистывать полэкрана. */}
        <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-5 sm:gap-2">
          {sections.map((section) => (
            <li key={section.id}>
              <Link
                href={`/market/${section.slug}`}
                className="glass flex h-full flex-col items-center gap-1 rounded-2xl border border-glass-brd px-1 py-2.5 text-center transition-colors hover:border-magenta/40 sm:px-2 sm:py-3"
              >
                <SectionIcon
                  iconKey={section.iconKey}
                  className="h-5 w-5 text-text-1"
                />
                <span className="line-clamp-2 text-[11px] leading-tight text-text-0 sm:text-xs">
                  {title(section)}
                </span>
                {/* Ноль не показываем: пустой раздел и так виден по отсутствию
                    товаров, а нули в сетке создают шум. */}
                {section.listingsCount > 0 && (
                  <span className="text-[10px] text-text-2">
                    {section.listingsCount}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    );
  }

  return (
    <nav className="mb-4">
      <ul className="flex flex-wrap gap-2">
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
                <SectionIcon iconKey={section.iconKey} className="h-4 w-4" />
                {title(section)}
                {section.listingsCount > 0 && (
                  <span className="text-xs opacity-60">
                    {section.listingsCount}
                  </span>
                )}
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
    "inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition-colors",
    active
      ? "border-glass-brd bg-glass-brd/50 text-text-0"
      : "border-glass-brd text-text-2 hover:text-text-0",
  ].join(" ");
}
