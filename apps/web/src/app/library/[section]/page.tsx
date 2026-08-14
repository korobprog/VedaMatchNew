import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProfile } from "@/lib/api";
import {
  getLibraryCategories,
  getLibraryFeed,
  getLibraryPreferences,
  getLibrarySections,
} from "@/lib/library-api";
import { Header } from "@/components/header";
import { BackLink } from "@/components/library/back-link";
import { CategoryEditForm } from "@/components/library/category-edit-form";
import { EntryFilters } from "@/components/library/entry-filters";
import { EntryList } from "@/components/library/entry-list";
import { SectionStrip } from "@/components/library/section-strip";
import { pickLocalized, t } from "@/components/library/i18n";

export default async function LibrarySectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getProfile();
  if (!user) redirect("/login");

  const { section: sectionSlug } = await params;
  const query = await searchParams;
  const [sections, categories, preferences, feed] = await Promise.all([
    getLibrarySections(),
    getLibraryCategories(sectionSlug),
    getLibraryPreferences(),
    getLibraryFeed({ ...query, sectionSlug }),
  ]);

  const section = sections?.find((item) => item.slug === sectionSlug);
  if (!section) notFound();

  const locale = preferences?.uiLanguage ?? "ru";

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-5xl px-4 py-8 pb-24">
        <BackLink locale={locale} fallbackHref="/library" />
        <SectionStrip
          sections={sections ?? []}
          locale={locale}
          activeSlug={sectionSlug}
        />

        <h1 className="mb-4 font-display text-2xl font-bold text-text-0">
          {pickLocalized(locale, {
            ru: section.titleRu,
            en: section.titleEn,
          })}
        </h1>

        {categories && categories.length > 0 ? (
          <ul className="mb-6 flex flex-wrap gap-2">
            {categories.map((category) => (
              <li key={category.id} className="flex flex-wrap items-center">
                <Link
                  href={`/library/${sectionSlug}/${category.slug}`}
                  className="glass rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1 hover:text-text-0"
                >
                  {pickLocalized(locale, {
                    ru: category.titleRu,
                    en: category.titleEn,
                  })}
                  <span className="ml-2 text-xs text-text-2">
                    {category.entriesCount}
                  </span>
                </Link>
                <CategoryEditForm locale={locale} category={category} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="glass mb-6 rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
            {t(locale, "category.empty")}
          </p>
        )}

        <EntryFilters locale={locale} categories={categories ?? []} />

        {feed && (
          <EntryList
            initialFeed={feed}
            locale={locale}
            query={{ ...query, sectionSlug }}
          />
        )}
      </main>
    </div>
  );
}
