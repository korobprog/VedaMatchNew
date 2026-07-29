import Link from "next/link";
import type { LibraryLocale, LibrarySectionDto } from "@vedamatch/shared";
import { pickLocalized } from "./i18n";

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
    <nav className="mb-6 flex gap-2 overflow-x-auto pb-1">
      {sections.map((section) => {
        const active = section.slug === activeSlug;
        return (
          <Link
            key={section.id}
            href={`/library/${section.slug}`}
            className={`glass shrink-0 rounded-xl border px-3 py-2 text-sm ${
              active
                ? "border-glass-brd text-text-0"
                : "border-transparent text-text-1 hover:text-text-0"
            }`}
          >
            <span className="block font-medium">
              {pickLocalized(locale, {
                ru: section.titleRu,
                en: section.titleEn,
              })}
            </span>
            <span className="text-xs text-text-2">{section.entriesCount}</span>
          </Link>
        );
      })}
    </nav>
  );
}
