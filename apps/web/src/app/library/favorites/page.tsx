import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getProfile } from "@/lib/api";
import { getLibraryFeed, getLibraryPreferences } from "@/lib/library-api";
import { Header } from "@/components/header";
import { BackLink } from "@/components/library/back-link";
import { EntryList } from "@/components/library/entry-list";
import { t } from "@/components/library/i18n";

export const metadata: Metadata = {
  title: "Избранное — Библиотека ссылок VedaMatch",
  description: "Ссылки, сохранённые вами в библиотеке VedaMatch",
};

export default async function LibraryFavoritesPage() {
  const user = await getProfile();
  if (!user) redirect("/login");

  const [preferences, feed] = await Promise.all([
    getLibraryPreferences(),
    getLibraryFeed({ bookmarked: "true" }),
  ]);
  const locale = preferences?.uiLanguage ?? "ru";

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-5xl px-4 py-8 pb-24">
        <BackLink locale={locale} fallbackHref="/library" />
        <h1 className="mb-6 font-display text-2xl font-bold text-text-0">
          {t(locale, "bookmark.title")}
        </h1>

        {feed && feed.items.length > 0 ? (
          <EntryList
            locale={locale}
            initialFeed={feed}
            query={{ bookmarked: "true" }}
          />
        ) : (
          <p className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
            {t(locale, "bookmark.empty")}
          </p>
        )}
      </main>
    </div>
  );
}
