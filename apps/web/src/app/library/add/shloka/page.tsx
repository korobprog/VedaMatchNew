import Link from "next/link";
import { getProfile } from "@/lib/api";
import { redirectToLogin } from "@/lib/require-user";
import {
  getLibraryCategoryPage,
  getLibraryCategoryTree,
  getLibraryPreferences,
  getLibraryShlokaList,
} from "@/lib/library-api";
import { Header } from "@/components/header";
import { BackLink } from "@/components/library/back-link";
import { pickLocalized } from "@/components/library/i18n";
import { ShlokaForm } from "@/components/library/shloka/shloka-form";
import { shlokaSourcesInTree } from "@/components/library/shloka/shloka-mode";
import { st } from "@/components/library/shloka/shloka-text";

/**
 * Новая шлока (VED-386). Открывается из раздела-источника
 * (`?category=<slug>`), и источник уже проставлен по нему. Без раздела —
 * сперва выбор источника: у шлоки без него нет места в ряду стихов.
 */
export default async function LibraryAddShlokaPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category: slug } = await searchParams;
  const user = await getProfile();
  if (!user)
    redirectToLogin(
      slug
        ? `/library/add/shloka?category=${encodeURIComponent(slug)}`
        : "/library/add/shloka",
    );

  const [preferences, page, list, tree] = await Promise.all([
    getLibraryPreferences(),
    slug ? getLibraryCategoryPage(slug) : Promise.resolve(null),
    slug ? getLibraryShlokaList(slug).catch(() => null) : Promise.resolve(null),
    slug ? Promise.resolve(null) : getLibraryCategoryTree(),
  ]);
  const locale = preferences?.uiLanguage ?? "ru";
  const pick = (row: { titleRu: string | null; titleEn: string | null }) =>
    pickLocalized(locale, { ru: row.titleRu, en: row.titleEn });

  if (!page || !list) {
    const sources = shlokaSourcesInTree(tree ?? [], pick);
    return (
      <div className="relative min-h-dvh bg-bg-0">
        <Header user={user} />
        <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
          <BackLink locale={locale} fallbackHref="/library" />
          <h1 className="mb-4 font-display text-2xl font-bold text-text-0">
            {st(locale, "form.createTitle")}
          </h1>
          {sources.length > 0 ? (
            <>
              <p className="mb-3 text-sm text-text-1">{st(locale, "root.pick")}</p>
              <ul className="grid gap-2">
                {sources.map((source) => (
                  <li key={source.slug}>
                    <Link
                      href={`/library/add/shloka?category=${encodeURIComponent(source.slug)}`}
                      className="glass flex min-h-12 items-center rounded-2xl border border-glass-brd px-4 text-text-0 hover:border-gold/60"
                    >
                      {source.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="glass rounded-2xl border border-glass-brd p-5 text-sm text-text-1">
              {st(locale, "root.none")}{" "}
              <Link href="/library" className="underline">
                {st(locale, "root.toSection")}
              </Link>
            </p>
          )}
        </main>
      </div>
    );
  }

  const sourceTitle = pick(page.category);

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
        <BackLink locale={locale} fallbackHref={`/library/${page.category.slug}`} />
        <h1 className="mb-1 font-display text-2xl font-bold text-text-0">
          {st(locale, "form.createTitle")}
        </h1>
        <p className="mb-6 text-sm text-text-1">
          {st(locale, "view.source")}:{" "}
          <Link href={`/library/${page.category.slug}`} className="underline">
            {sourceTitle}
          </Link>
        </p>
        <section className="glass rounded-2xl border border-glass-brd p-4">
          <ShlokaForm
            locale={locale}
            target={{
              kind: "create",
              categoryId: page.category.id,
              sourceLabel: list.sourceLabel,
            }}
          />
        </section>
      </main>
    </div>
  );
}
