import Link from "next/link";
import type { LibraryLocale, LibrarySectionDto } from "@vedamatch/shared";
import { SectionEditForm } from "./section-edit-form";
import { pickLocalized, t } from "./i18n";

/**
 * Разделы показываем сеткой, а не горизонтальной лентой: их фиксированные
 * восемь, и все должны быть видны сразу — без прокрутки и скрытых элементов.
 */
export function SectionStrip({
  sections,
  locale,
  activeSlug,
}: {
  sections: LibrarySectionDto[];
  locale: LibraryLocale;
  activeSlug?: string;
}) {
  return (
    <nav
      aria-label={t(locale, "nav.sections")}
      className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
    >
      {sections.map((section) => {
        const active = section.slug === activeSlug;
        return (
          <div key={section.id} className="relative">
            <Link
              href={`/library/${section.slug}`}
              aria-current={active ? "page" : undefined}
              className={`glass flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
                active
                  ? "border-glass-brd text-text-0"
                  : "border-transparent text-text-1 hover:text-text-0"
              } ${section.canEdit ? "pr-8" : ""}`}
            >
              <span className="font-medium">
                {pickLocalized(locale, {
                  ru: section.titleRu,
                  en: section.titleEn,
                })}
              </span>
              <span className="shrink-0 text-xs text-text-2">
                {section.entriesCount}
              </span>
            </Link>
            {section.canEdit && (
              <div className="absolute right-2 top-2 z-20">
                <SectionEditForm locale={locale} section={section} />
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
