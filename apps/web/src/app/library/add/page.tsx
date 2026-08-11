import { redirect } from "next/navigation";
import { getProfile } from "@/lib/api";
import {
  getLibraryCategories,
  getLibraryPreferences,
  getLibrarySections,
} from "@/lib/library-api";
import { Header } from "@/components/header";
import { AddEntryForm } from "@/components/library/add-entry-form";
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

        <section className="glass rounded-2xl border border-glass-brd p-4">
          <AddEntryForm
            locale={locale}
            categories={categories ?? []}
            sections={sections ?? []}
            initialSectionSlug={activeSection}
          />
        </section>
      </main>
    </div>
  );
}
