import Link from "next/link";
import { notFound } from "next/navigation";
import { redirectToLogin } from "@/lib/require-user";
import { getProfile } from "@/lib/api";
import {
  getLibraryCategories,
  getLibraryFeed,
  getLibraryPreferences,
  getLibrarySections,
} from "@/lib/library-api";
import { Header } from "@/components/header";
import { BackLink } from "@/components/library/back-link";
import { EntryFilters } from "@/components/library/entry-filters";
import { EntryList } from "@/components/library/entry-list";
import { SectionStrip } from "@/components/library/section-strip";
import { pickLocalized, t } from "@/components/library/i18n";

export default async function LibraryCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string; category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getProfile();
  if (!user) {
    const { section, category } = await params;
    redirectToLogin(`/library/${section}/${category}`);
  }

  const { section: sectionSlug, category: categorySlug } = await params;
  const query = await searchParams;
  const [sections, categories, preferences, feed] = await Promise.all([
    getLibrarySections(),
    getLibraryCategories(sectionSlug),
    getLibraryPreferences(),
    getLibraryFeed({ ...query, categorySlug }),
  ]);

  const category = categories?.find((item) => item.slug === categorySlug);
  if (!category) notFound();

  const locale = preferences?.uiLanguage ?? "ru";

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-5xl px-4 py-8 pb-24">
        <BackLink locale={locale} fallbackHref="/library" />
        <SectionStrip
          sections={sections ?? []}
          locale={locale}
          activeSlug={sectionSlug}
        />

        <div className="mb-1 flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-display text-2xl font-bold text-text-0">
            {pickLocalized(locale, {
              ru: category.titleRu,
              en: category.titleEn,
            })}
          </h1>
          <Link
            href={`/library/add?section=${encodeURIComponent(sectionSlug)}`}
            className="btn-mint rounded-xl px-4 py-2 text-sm font-semibold shadow-[0_0_12px_var(--vm-glow-mint)]"
          >
            {t(locale, "nav.add")}
          </Link>
        </div>
        <p className="mb-6 text-sm text-text-2">
          {category.entriesCount} {t(locale, "category.entries")}
        </p>

        <EntryFilters
          locale={locale}
          categories={categories ?? []}
          categoryBasePath={`/library/${sectionSlug}`}
          currentCategorySlug={categorySlug}
        />

        {feed && (
          <EntryList
            key={JSON.stringify({ ...query, categorySlug })}
            initialFeed={feed}
            locale={locale}
            query={{ ...query, categorySlug }}
          />
        )}
      </main>
    </div>
  );
}
