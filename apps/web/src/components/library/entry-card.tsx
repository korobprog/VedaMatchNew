import Link from "next/link";
import { ExternalLink, ThumbsUp } from "lucide-react";
import type { LibraryEntryDto, LibraryLocale } from "@vedamatch/shared";
import { entryTypeLabel, pickLocalized, t } from "./i18n";

export function EntryCard({
  entry,
  locale,
}: {
  entry: LibraryEntryDto;
  locale: LibraryLocale;
}) {
  const title = pickLocalized(locale, {
    ru: entry.titleRu,
    en: entry.titleEn,
  });
  const description = pickLocalized(locale, {
    ru: entry.descriptionRu,
    en: entry.descriptionEn,
  });

  return (
    <article className="glass rounded-2xl border border-glass-brd p-4">
      <div className="mb-2 flex items-center gap-2 text-xs text-text-2">
        <span>{entry.domain}</span>
        <span aria-hidden>·</span>
        <span className="rounded-full border border-glass-brd px-2 py-0.5">
          {entryTypeLabel(locale, entry.type)}
        </span>
        <span className="uppercase">{entry.contentLanguage}</span>
      </div>

      <h3 className="mb-1 font-display text-base font-semibold text-text-0">
        <a
          href={entry.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:underline"
        >
          {title}
          <ExternalLink aria-hidden className="h-3.5 w-3.5" />
        </a>
      </h3>

      {description && (
        <p className="mb-3 line-clamp-2 text-sm text-text-1">{description}</p>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-text-2">
        <span className="inline-flex items-center gap-1">
          <ThumbsUp aria-hidden className="h-3.5 w-3.5" />
          {entry.usefulCount}
        </span>
        <span>
          {t(locale, "entry.clicks")}: {entry.uniqueClickCount}
        </span>
        {entry.categories.map((category) => (
          <Link
            key={category.id}
            href={`/library/${category.sectionSlug}/${category.slug}`}
            className="rounded-full bg-glass-brd/40 px-2 py-0.5 hover:text-text-0"
          >
            {pickLocalized(locale, {
              ru: category.titleRu,
              en: category.titleEn,
            })}
          </Link>
        ))}
        <Link
          href={`/library/entry/${entry.id}`}
          className="ml-auto hover:text-text-0"
        >
          {t(locale, "entry.open")}
        </Link>
      </div>
    </article>
  );
}
