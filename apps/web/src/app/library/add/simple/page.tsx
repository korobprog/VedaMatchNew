import { getProfile } from "@/lib/api";
import { redirectToLogin } from "@/lib/require-user";
import {
  getLibraryCategories,
  getLibraryPreferences,
  getLibrarySections,
} from "@/lib/library-api";
import { Header } from "@/components/header";
import { BackLink } from "@/components/library/back-link";
import { AddEntryWizard } from "@/components/library/add-entry-wizard";
import { t } from "@/components/library/i18n";

export default async function LibraryAddSimplePage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const user = await getProfile();
  if (!user) redirectToLogin("/library/add/simple");

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
    <div className="relative min-h-dvh bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
        <BackLink locale={locale} fallbackHref="/library/add" />
        <h1 className="mb-6 font-display text-2xl font-bold text-text-0">
          {t(locale, "add.title")} · {t(locale, "add.modeSimple")}
        </h1>

        <section className="glass rounded-2xl border border-glass-brd p-4">
          <AddEntryWizard
            locale={locale}
            sections={sections ?? []}
            categories={categories ?? []}
            initialSectionSlug={activeSection}
          />
        </section>
      </main>
    </div>
  );
}
