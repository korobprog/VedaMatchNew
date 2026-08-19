import Link from "next/link";
import { redirectToLogin } from "@/lib/require-user";
import { getProfile } from "@/lib/api";
import {
  getLibraryCategories,
  getLibraryComments,
  getLibraryEntry,
  getLibraryPreferences,
  getLibrarySections,
} from "@/lib/library-api";
import { videoEmbedUrl, videoProviderName, videoSource } from "@vedamatch/shared";
import { Header } from "@/components/header";
import { BackLink } from "@/components/library/back-link";
import { BookmarkButton } from "@/components/library/bookmark-button";
import { DeleteEntryButton } from "@/components/library/delete-entry-button";
import { EditEntryForm } from "@/components/library/edit-entry-form";
import { EntryComments } from "@/components/library/entry-comments";
import { VideoEmbed } from "@/components/library/video-embed";
import { entryTypeLabel, pickLocalized, t } from "@/components/library/i18n";

export default async function LibraryEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getProfile();
  if (!user) {
    const { id } = await params;
    redirectToLogin(`/library/entry/${id}`);
  }

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
          <BackLink locale={locale} fallbackHref="/library" />
          <p className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
            {t(locale, "entry.notFound")}
          </p>
        </main>
      </div>
    );
  }

  const title = pickLocalized(locale, {
    ru: entry.titleRu,
    en: entry.titleEn,
  });
  const embedUrl = videoEmbedUrl(entry.url);
  const provider = videoSource(entry.url)?.provider;
  const primarySectionSlug = entry.categories[0]?.sectionSlug;
  const [comments, sections, editCategories] = await Promise.all([
    getLibraryComments(entry.id),
    entry.canEdit ? getLibrarySections() : Promise.resolve(null),
    entry.canEdit && primarySectionSlug
      ? getLibraryCategories(primarySectionSlug)
      : Promise.resolve(null),
  ]);

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
        <BackLink locale={locale} fallbackHref="/library" />
        <p className="mb-2 text-xs text-text-2">
          {entry.domain} · {entryTypeLabel(locale, entry.type)} ·{" "}
          {entry.contentLanguage.toUpperCase()}
          {entry.hasCustomPreview && (
            <>
              {" "}
              ·{" "}
              <span className="rounded-full bg-glass-brd/40 px-2 py-0.5">
                {t(locale, "entry.customPreview")}
              </span>
            </>
          )}
        </p>
        {embedUrl ? (
          <VideoEmbed
            locale={locale}
            embedUrl={embedUrl}
            previewUrl={entry.previewUrl}
            title={title}
          />
        ) : (
          entry.previewUrl && (
            <a
              href={entry.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-4 block overflow-hidden rounded-2xl border border-glass-brd"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- обложка лежит в нашем S3 */}
              <img
                src={entry.previewUrl}
                alt={t(locale, "entry.preview")}
                className="aspect-video w-full object-cover"
              />
            </a>
          )
        )}
        <h1 className="mb-3 font-display text-2xl font-bold text-text-0">
          {title}
        </h1>
        <p className="mb-6 text-text-1">
          {pickLocalized(locale, {
            ru: entry.descriptionRu,
            en: entry.descriptionEn,
          })}
        </p>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <a
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl bg-glass-brd/40 px-4 py-2 text-sm text-text-0 hover:bg-glass-brd/60"
          >
            {provider
              ? `${t(locale, "entry.watchOn")} ${videoProviderName(provider)}`
              : t(locale, "entry.open")}
          </a>
          <BookmarkButton
            locale={locale}
            entryId={entry.id}
            initialBookmarked={entry.bookmarked}
            initialCount={entry.bookmarkCount}
          />
        </div>

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

        {entry.canEdit && (
          <>
            <EditEntryForm
              locale={locale}
              entry={entry}
              sections={sections ?? []}
              initialCategories={editCategories ?? []}
            />
            <div className="mb-6">
              <DeleteEntryButton
                locale={locale}
                entryId={entry.id}
                redirectTo="/library"
              />
            </div>
          </>
        )}

        <EntryComments
          locale={locale}
          entryId={entry.id}
          initialComments={comments?.items ?? []}
        />
      </main>
    </div>
  );
}
