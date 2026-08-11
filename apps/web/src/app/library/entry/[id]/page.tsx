import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/api";
import { getLibraryEntry, getLibraryPreferences } from "@/lib/library-api";
import { Header } from "@/components/header";
import { entryTypeLabel, pickLocalized, t } from "@/components/library/i18n";

export default async function LibraryEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getProfile();
  if (!user) redirect("/login");

  const { id } = await params;
  const [entry, preferences] = await Promise.all([
    getLibraryEntry(id),
    getLibraryPreferences(),
  ]);
  const locale = preferences?.uiLanguage ?? "ru";

  if (!entry) {
    return (
      <div className="relative min-h-screen bg-bg-0">
        <Header user={user} />
        <main className="mx-auto max-w-3xl px-4 py-8">
          <p className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
            {t(locale, "entry.notFound")}
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
        <p className="mb-2 text-xs text-text-2">
          {entry.domain} · {entryTypeLabel(locale, entry.type)} ·{" "}
          {entry.contentLanguage.toUpperCase()}
        </p>
        {entry.previewUrl && (
          <a
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-4 block overflow-hidden rounded-2xl border border-glass-brd"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- обложка приходит с внешнего CDN */}
            <img
              src={entry.previewUrl}
              alt={t(locale, "entry.preview")}
              className="aspect-video w-full object-cover"
            />
          </a>
        )}
        <h1 className="mb-3 font-display text-2xl font-bold text-text-0">
          {pickLocalized(locale, { ru: entry.titleRu, en: entry.titleEn })}
        </h1>
        <p className="mb-6 text-text-1">
          {pickLocalized(locale, {
            ru: entry.descriptionRu,
            en: entry.descriptionEn,
          })}
        </p>

        <a
          href={entry.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-6 inline-block rounded-xl bg-glass-brd/40 px-4 py-2 text-sm text-text-0 hover:bg-glass-brd/60"
        >
          {t(locale, "entry.open")}
        </a>

        <section className="glass rounded-2xl border border-glass-brd p-4 text-sm text-text-1">
          <p className="mb-2">
            {t(locale, "entry.categories")}:{" "}
            {entry.categories.map((category, index) => (
              <span key={category.id}>
                {index > 0 && ", "}
                <Link
                  href={`/library/${category.sectionSlug}/${category.slug}`}
                  className="hover:text-text-0"
                >
                  {pickLocalized(locale, {
                    ru: category.titleRu,
                    en: category.titleEn,
                  })}
                </Link>
              </span>
            ))}
          </p>
          {entry.addedBy && (
            <p className="text-text-2">
              {t(locale, "entry.addedBy")}: {entry.addedBy.name}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
