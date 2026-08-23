import { getProfile } from "@/lib/api";
import { redirectToLogin } from "@/lib/require-user";
import {
  getLibraryCategories,
  getLibraryPreferences,
  getLibrarySections,
} from "@/lib/library-api";
import { Header } from "@/components/header";
import { BackLink } from "@/components/library/back-link";
import { AddEntryForm } from "@/components/library/add-entry-form";
import { t } from "@/components/library/i18n";

export default async function LibraryAddProPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const user = await getProfile();
  if (!user) redirectToLogin("/library/add/pro");

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
        <h1 className="mb-4 font-display text-2xl font-bold text-text-0">
          {t(locale, "add.title")} · {t(locale, "add.modePro")}
        </h1>

        {/* Полная форма просит больше, чем обязательный минимум, — стоит
            объяснить, что за это получает добавляющий, иначе поля выглядят
            бюрократией и их пролистывают. */}
        <section className="mb-4 rounded-2xl border border-glass-brd p-4">
          <h2 className="mb-2 text-sm font-semibold text-text-0">
            {t(locale, "add.proWhy")}
          </h2>
          <ul className="grid gap-1.5 text-sm text-text-1">
            <li>· {t(locale, "add.proWhyTitles")}</li>
            <li>· {t(locale, "add.proWhyDescription")}</li>
            <li>· {t(locale, "add.proWhyCategories")}</li>
          </ul>
        </section>

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
