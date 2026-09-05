import Link from "next/link";
import { redirectToLogin } from "@/lib/require-user";
import type { Metadata } from "next";
import { getProfile } from "@/lib/api";
import {
  getLibraryCategoryTree,
  getLibraryCommunities,
  getLibraryFeed,
  getLibraryPreferences,
} from "@/lib/library-api";
import { Header } from "@/components/header";
import { CategoryNavigator } from "@/components/library/category-navigator";
import { EntryFilters } from "@/components/library/entry-filters";
import { EntryList } from "@/components/library/entry-list";
import { LocaleSwitch } from "@/components/library/locale-switch";
import { t } from "@/components/library/i18n";

export const metadata: Metadata = {
  title: "Образование",
  description:
    "Общая база полезных материалов VedaMatch: статьи, видео, книги, курсы и каналы",
};

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getProfile();
  if (!user) redirectToLogin("/library");

  const params = await searchParams;
  const [tree, preferences, feed, communities] = await Promise.all([
    getLibraryCategoryTree(),
    getLibraryPreferences(),
    getLibraryFeed(params),
    getLibraryCommunities(),
  ]);
  const locale = preferences?.uiLanguage ?? "ru";
  const roots = tree ?? [];

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-5xl px-4 py-8 pb-24">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-0">
              {t(locale, "service.title")}
            </h1>
            <p className="text-text-1">{t(locale, "service.subtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/library/favorites"
              className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-2 hover:text-text-0"
            >
              {t(locale, "bookmark.title")}
            </Link>
            <Link
              href="/library/add"
              className="btn-mint rounded-xl px-4 py-2 text-sm font-semibold shadow-[0_0_12px_var(--vm-glow-mint)]"
            >
              {t(locale, "nav.add")}
            </Link>
            <LocaleSwitch locale={locale} />
          </div>
        </div>

        <CategoryNavigator
          locale={locale}
          categories={roots}
          tree={roots}
          canOrganize={roots.some((root) => root.canMove)}
          root
        />
        <EntryFilters
          locale={locale}
          categories={[]}
          communities={communities ?? []}
        />

        {feed && (
          <EntryList
            key={JSON.stringify(params)}
            initialFeed={feed}
            locale={locale}
            query={params}
          />
        )}
      </main>
    </div>
  );
}
