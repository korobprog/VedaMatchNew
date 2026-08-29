import { getProfile } from "@/lib/api";
import { redirectToLogin } from "@/lib/require-user";
import {
  getLibraryCategoryTree,
  getLibraryPreferences,
} from "@/lib/library-api";
import { Header } from "@/components/header";
import { BackLink } from "@/components/library/back-link";
import { AddEntryForm } from "@/components/library/add-entry-form";
import { t } from "@/components/library/i18n";

export default async function LibraryAddProPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const user = await getProfile();
  if (!user) redirectToLogin("/library/add/pro");

  const { category } = await searchParams;
  const [tree, preferences] = await Promise.all([
    getLibraryCategoryTree(),
    getLibraryPreferences(),
  ]);
  const locale = preferences?.uiLanguage ?? "ru";
  const roots = tree ?? [];
  // Завести рубрику верхнего уровня может только администрация: у неё
  // единственной есть право двигать дерево, `canMove` это и означает.
  const canCreateRoot = roots.some((root) => root.canMove);

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
            tree={roots}
            initialCategorySlug={category}
            canCreateRoot={canCreateRoot}
          />
        </section>
      </main>
    </div>
  );
}
