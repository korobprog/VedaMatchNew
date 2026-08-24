import Link from "next/link";
import { redirectToLogin } from "@/lib/require-user";
import type { Metadata } from "next";
import { getProfile } from "@/lib/api";
import {
  getLibraryFeed,
  getLibraryPreferences,
  getLibrarySections,
} from "@/lib/library-api";
import { Header } from "@/components/header";
import { EntryFilters } from "@/components/library/entry-filters";
import { EntryList } from "@/components/library/entry-list";
import { LocaleSwitch } from "@/components/library/locale-switch";
import { SectionStrip } from "@/components/library/section-strip";
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
  const [sections, preferences, feed] = await Promise.all([
    getLibrarySections(),
    getLibraryPreferences(),
    getLibraryFeed(params),
  ]);
  const locale = preferences?.uiLanguage ?? "ru";

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
              className="rounded-xl bg-glass-brd/40 px-4 py-2 text-sm text-text-0 hover:bg-glass-brd/60"
            >
              {t(locale, "nav.add")}
            </Link>
            <LocaleSwitch locale={locale} />
          </div>
        </div>

        <SectionStrip sections={sections ?? []} locale={locale} />
        <EntryFilters locale={locale} categories={[]} />

        {feed && <EntryList initialFeed={feed} locale={locale} query={params} />}
      </main>
    </div>
  );
}
