import Link from "next/link";
import { redirectToLogin } from "@/lib/require-user";
import { getProfile } from "@/lib/api";
import {
  getLibraryCategoryTree,
  getLibraryComments,
  getLibraryEntry,
  getLibraryPreferences,
  getLibraryShloka,
} from "@/lib/library-api";
import { videoEmbedUrl, videoProviderName, videoSource } from "@vedamatch/shared";
import { Header } from "@/components/header";
import { BackLink } from "@/components/library/back-link";
import { BookmarkButton } from "@/components/library/bookmark-button";
import { CoverPicture } from "@/components/library/cover-picture";
import { CoverViewer } from "@/components/library/cover-viewer";
import { DeleteEntryButton } from "@/components/library/delete-entry-button";
import {
  ENTRY_ICON_BUTTON,
  EntryShareActions,
} from "@/components/library/entry-share-actions";
import { EntrySpeakButton } from "@/components/library/entry-speak-button";
import { buildSpokenEntry } from "@/components/library/entry-speech";
import { EditEntryForm } from "@/components/library/edit-entry-form";
import { EntryComments } from "@/components/library/entry-comments";
import { OutsideLink } from "@/components/library/outside-link";
import { VideoEmbed } from "@/components/library/video-embed";
import { entryTypeLabel, pickLocalized, t } from "@/components/library/i18n";
import { kathaParagraphs } from "@/components/library/katha-text";
import { EntryFiles } from "@/components/library/entry-files";
import { ShlokaView } from "@/components/library/shloka/shloka-view";

export default async function LibraryEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /** `created` — сюда пришли прямо из формы публикации (VED-91).
   *  `mode=edit` — окно шлоки сразу в правке (VED-386). */
  searchParams: Promise<{
    created?: string | string[];
    mode?: string | string[];
  }>;
}) {
  const query = await searchParams;
  const justCreated = Boolean(query.created);
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
      <div className="relative min-h-dvh bg-bg-0">
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

  // Шлока — своё окно: стих, стрелки по источнику, «Чтение / Правка»
  // (VED-386). Адрес общий с материалами — ссылки из ленты, поиска и
  // избранного ведут сюда же.
  if (entry.type === "shloka") {
    const [shloka, shlokaComments] = await Promise.all([
      getLibraryShloka(entry.id),
      getLibraryComments(entry.id),
    ]);
    if (shloka) {
      return (
        <div className="relative min-h-dvh bg-bg-0">
          <Header user={user} />
          <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
            <BackLink
              locale={locale}
              fallbackHref={
                shloka.category ? `/library/${shloka.category.slug}` : "/library"
              }
            />
            <ShlokaView
              key={shloka.id}
              locale={locale}
              shloka={shloka}
              initialMode={query.mode === "edit" ? "edit" : "read"}
            />
            <div className="my-6 flex flex-wrap items-center gap-3">
              <BookmarkButton
                locale={locale}
                entryId={shloka.id}
                initialBookmarked={shloka.bookmarked}
                initialCount={shloka.bookmarkCount}
              />
              {shloka.addedBy && (
                <p className="text-sm text-text-2">
                  {t(locale, "entry.addedBy")}: {shloka.addedBy.name}
                </p>
              )}
            </div>
            <EntryComments
              locale={locale}
              entryId={shloka.id}
              initialComments={shlokaComments?.items ?? []}
            />
          </main>
        </div>
      );
    }
  }

  const title = pickLocalized(locale, {
    ru: entry.titleRu,
    en: entry.titleEn,
  });
  const embedUrl = entry.url ? videoEmbedUrl(entry.url) : null;
  const provider = entry.url ? videoSource(entry.url)?.provider : undefined;
  const [comments, tree] = await Promise.all([
    getLibraryComments(entry.id),
    entry.canEdit ? getLibraryCategoryTree() : Promise.resolve(null),
  ]);

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
        {/* Только что опубликованный материал: «Назад» ведёт в его раздел,
            а не по истории — там позади форма добавления (VED-91). */}
        {/* Справа от «Назад» — «Поделиться», «В Блог-ленту» и «Озвучить»
            значками, слева направо, как на скриншоте карточки VED-515. */}
        <div className="-mt-3 mb-2 flex flex-wrap items-center gap-2">
          <div className="mt-3">
            <BackLink
              locale={locale}
              fallbackHref={
                entry.categories[0]
                  ? `/library/${entry.categories[0].slug}`
                  : "/library"
              }
              skipHistory={justCreated}
            />
          </div>
          <EntryShareActions
            locale={locale}
            entryId={entry.id}
            title={title}
            blogSharedAt={entry.blogSharedAt}
            compact
            trailing={
              <EntrySpeakButton
                locale={locale}
                entryId={entry.id}
                text={buildSpokenEntry({
                  title,
                  description: pickLocalized(locale, {
                    ru: entry.descriptionRu,
                    en: entry.descriptionEn,
                  }),
                  body: entry.body,
                })}
                className={ENTRY_ICON_BUTTON}
              />
            }
          />
        </div>
        <p className="mb-2 text-xs text-text-2">
          {/* Домена нет у материала без адреса — тогда и разделитель перед
              типом лишний, иначе строка начинается с висящей точки. */}
          {entry.domain && <>{entry.domain} · </>}
          {entryTypeLabel(locale, entry.type)} ·{" "}
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
            sourceUrl={entry.url}
          />
        ) : (
          entry.previewUrl && (
            // Картинка на странице материала открывается во весь экран — с
            // приближением и «Скачать» (VED-138). К источнику ведёт кнопка
            // «Открыть» ниже: раньше туда вела и сама картинка, но на своей
            // странице от нажатия на картинку ждут именно её, крупно.
            <CoverViewer
              locale={locale}
              entryId={entry.id}
              src={entry.previewUrl}
              alt={t(locale, "entry.preview")}
              className="mb-4"
            >
              <CoverPicture
                src={entry.previewUrl}
                alt={t(locale, "entry.preview")}
                maxHeight="70vh"
                rounded="rounded-2xl"
              />
            </CoverViewer>
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

        {/* Текст катхи — ради него страница и открыта. `lang` включает
            переносы по правилам языка текста, а не интерфейса: русская
            лекция в английском интерфейсе иначе переносилась бы
            по-английски. */}
        {entry.body && (
          <div
            lang={entry.contentLanguage}
            className="mb-6 grid gap-4 break-words hyphens-auto text-[15px] leading-7 text-text-0"
          >
            {kathaParagraphs(entry.body).map((paragraph, index) => (
              <p key={index} className="whitespace-pre-line">
                {paragraph}
              </p>
            ))}
          </div>
        )}

        {/* Файлы книги — сразу за текстом: ради них на страницу и приходят,
            а ряд кнопок ниже — про материал целиком. */}
        <EntryFiles
          locale={locale}
          entryId={entry.id}
          files={entry.files ?? []}
          canEdit={entry.canEdit}
        />

        <div className="mb-6 flex flex-wrap items-center gap-3">
          {/* У материала без адреса открывать нечего — вместо кнопки
              показываем, где его искать. */}
          {entry.url ? (
            <OutsideLink
              href={entry.url}
              className="rounded-xl bg-glass-brd/40 px-4 py-2 text-sm text-text-0 hover:bg-glass-brd/60"
            >
              {provider
                ? `${t(locale, "entry.watchOn")} ${videoProviderName(provider)}`
                : t(locale, "entry.open")}
            </OutsideLink>
          ) : (
            entry.source && (
              <p className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1">
                {t(locale, "add.source")}: {entry.source}
              </p>
            )
          )}
          <BookmarkButton
            locale={locale}
            entryId={entry.id}
            initialBookmarked={entry.bookmarked}
            initialCount={entry.bookmarkCount}
          />

          {/* Куда материал попал: сразу после добавления это единственный
              способ увидеть его в общем ряду, а не поодиночке. */}
          {entry.categories[0] && (
            <Link
              href={`/library/${entry.categories[0].slug}`}
              className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1 hover:text-text-0"
            >
              {t(locale, "entry.openCategory")}
            </Link>
          )}

          <Link
            href="/library/add"
            className="rounded-xl border border-glass-brd px-4 py-2 text-sm text-text-1 hover:text-text-0"
          >
            {t(locale, "entry.addMore")}
          </Link>
        </div>

        <section className="glass rounded-2xl border border-glass-brd p-4 text-sm text-text-1">
          <p className="mb-2">
            {t(locale, "entry.categories")}:{" "}
            {entry.categories.map((category, index) => (
              <span key={category.id}>
                {index > 0 && ", "}
                <Link
                  href={`/library/${category.slug}`}
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
              tree={tree ?? []}
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
