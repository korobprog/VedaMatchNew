import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/api";
import {
  getLibraryCategories,
  getLibraryPreferences,
  getLibrarySections,
} from "@/lib/library-api";
import { Header } from "@/components/header";
import { AddEntryForm } from "@/components/library/add-entry-form";
import { CategoryCreateForm } from "@/components/library/category-create-form";
import { t } from "@/components/library/i18n";

export default async function LibraryAddPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const user = await getProfile();
  if (!user) redirect("/login");

  const { section } = await searchParams;
  const [sections, preferences] = await Promise.all([
    getLibrarySections(),
    getLibraryPreferences(),
  ]);
  const locale = preferences?.uiLanguage ?? "ru";
  const activeSection = section ?? sections?.[0]?.slug;
  const categories = activeSection
    ? await getLibraryCategories(activeSection)
    : [];

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
        <h1 className="mb-6 font-display text-2xl font-bold text-text-0">
          {t(locale, "add.title")}
        </h1>

        <nav
          className="mb-4 flex flex-wrap gap-2"
          aria-label={t(locale, "filters.section")}
        >
          {(sections ?? []).map((item) => (
            <Link
              key={item.id}
              href={`/library/add?section=${encodeURIComponent(item.slug)}`}
              className={`rounded-xl border px-3 py-2 text-sm ${
                item.slug === activeSection
                  ? "border-glass-brd text-text-0"
                  : "border-transparent text-text-2 hover:text-text-0"
              }`}
            >
              {item.titleRu}
            </Link>
          ))}
        </nav>

        <section className="glass mb-8 rounded-2xl border border-glass-brd p-4">
          <AddEntryForm locale={locale} categories={categories ?? []} />
        </section>

        <h2 className="mb-4 font-display text-lg font-semibold text-text-0">
          {t(locale, "category.create")}
        </h2>
        <section className="glass rounded-2xl border border-glass-brd p-4">
          <CategoryCreateForm locale={locale} sections={sections ?? []} />
        </section>
      </main>
    </div>
  );
}
