import Link from "next/link";
import { Bookmark, ExternalLink, MessageSquare, Play, Users } from "lucide-react";
import type { LibraryEntryDto, LibraryLocale } from "@vedamatch/shared";
import { videoEmbedUrl } from "@vedamatch/shared";
import { DeleteEntryButton } from "./delete-entry-button";
import { entryTypeLabel, pickLocalized, t } from "./i18n";

export function EntryCard({
  entry,
  locale,
  onDeleted,
}: {
  entry: LibraryEntryDto;
  locale: LibraryLocale;
  /** Лента убирает карточку из уже подгруженного списка после удаления. */
  onDeleted?: () => void;
}) {
  const title = pickLocalized(locale, {
    ru: entry.titleRu,
    en: entry.titleEn,
  });
  const description = pickLocalized(locale, {
    ru: entry.descriptionRu,
    en: entry.descriptionEn,
  });
  // Видео открываем у себя — там плеер; для остального ведём к источнику.
  const playable = entry.url !== null && videoEmbedUrl(entry.url) !== null;

  return (
    <article className="glass rounded-2xl border border-glass-brd p-4">
      {entry.previewUrl &&
        (playable ? (
          <Link
            href={`/library/entry/${entry.id}`}
            aria-label={t(locale, "entry.play")}
            className="relative mb-3 block overflow-hidden rounded-xl border border-glass-brd"
          >
            <PreviewImage locale={locale} src={entry.previewUrl} />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-bg-0/70 text-text-0">
                <Play aria-hidden className="ml-0.5 h-5 w-5" />
              </span>
            </span>
          </Link>
        ) : entry.url ? (
          <a
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-3 block overflow-hidden rounded-xl border border-glass-brd"
          >
            <PreviewImage locale={locale} src={entry.previewUrl} />
          </a>
        ) : (
          // Без адреса открывать нечего, но обложку показываем: у материала
          // из книги она единственное изображение и загружена вручную.
          <span className="mb-3 block overflow-hidden rounded-xl border border-glass-brd">
            <PreviewImage locale={locale} src={entry.previewUrl} />
          </span>
        ))}

      <div className="mb-2 flex items-center gap-2 text-xs text-text-2">
        {/* У материала без адреса домена нет — на его месте источник. */}
        <span>{entry.domain ?? entry.source}</span>
        <span aria-hidden>·</span>
        <span className="rounded-full border border-glass-brd px-2 py-0.5">
          {entryTypeLabel(locale, entry.type)}
        </span>
        <span className="uppercase">{entry.contentLanguage}</span>
        {/* От чьего имени выложено. Ссылка ведёт не в общину, а в ленту,
            отфильтрованную по ней: человек, увидевший подпись, спрашивает
            «что ещё есть от них», а не «что это за ятра». */}
        {entry.community && (
          <Link
            href={`/library?communityId=${encodeURIComponent(entry.community.id)}`}
            className="inline-flex items-center gap-1 rounded-full border border-glass-brd px-2 py-0.5 hover:text-text-0"
          >
            <Users aria-hidden className="h-3 w-3" />
            {entry.community.name}
          </Link>
        )}
        {entry.hasCustomPreview && (
          <span className="rounded-full bg-glass-brd/40 px-2 py-0.5">
            {t(locale, "entry.customPreview")}
          </span>
        )}
      </div>

      <h3 className="mb-1 font-display text-base font-semibold text-text-0">
        {/* Без адреса открывать нечего — заголовок остаётся текстом, а куда
            смотреть, говорит строка источника выше. */}
        {entry.url ? (
          <a
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:underline"
          >
            {title}
            <ExternalLink aria-hidden className="h-3.5 w-3.5" />
          </a>
        ) : (
          title
        )}
      </h3>

      {description && (
        <p className="mb-3 line-clamp-2 text-sm text-text-1">{description}</p>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-text-2">
        <span className="inline-flex items-center gap-1">
          <Bookmark
            aria-hidden
            className={`h-3.5 w-3.5 ${entry.bookmarked ? "fill-current" : ""}`}
          />
          {entry.bookmarkCount}
        </span>
        <span className="inline-flex items-center gap-1">
          <MessageSquare aria-hidden className="h-3.5 w-3.5" />
          {entry.commentsCount}
        </span>
        <span>
          {t(locale, "entry.clicks")}: {entry.uniqueClickCount}
        </span>
        {entry.categories.map((category) => (
          <Link
            key={category.id}
            href={`/library/${category.slug}`}
            className="rounded-full bg-glass-brd/40 px-2 py-0.5 hover:text-text-0"
          >
            {pickLocalized(locale, {
              ru: category.titleRu,
              en: category.titleEn,
            })}
          </Link>
        ))}
        {/* Одна ссылка, а не две под разные экраны: спрятать лишнюю классом
            значит оставить её в дереве доступности, и скринридер прочитал бы
            «Открыть» дважды подряд на каждой карточке.

            На телефоне `w-full` в flex-wrap уводит её на свою строку — во всю
            ширину, с рамкой и по центру. В общей строке она оказывалась за
            чипами рубрик: те переносятся, и «Открыть» уезжало то на вторую
            строку, то к самому правому краю, куда большой палец не
            дотягивается. Да и текстовая ссылка среди счётчиков просмотров и
            комментариев не читалась как главное действие карточки, хотя она
            им и является.

            На широком экране всё это снимается: место есть, и кнопка во всю
            ширину карточки там выглядела бы грубо.

            Рамка, а не заливка: на экране пять-шесть карточек подряд, и
            столько сплошных кнопок превратили бы ленту в лестницу. */}
        <Link
          href={`/library/entry/${entry.id}`}
          className="order-last ml-auto flex min-h-11 w-full items-center justify-center rounded-xl border border-glass-brd text-sm font-semibold text-text-1 transition-colors hover:text-text-0 sm:order-none sm:min-h-0 sm:w-auto sm:rounded-none sm:border-0 sm:text-xs sm:font-normal sm:text-text-2 sm:hover:text-text-0"
        >
          {t(locale, "entry.open")}
        </Link>
      </div>

      {/* Автору и админу правку и удаление показываем прямо в ленте: ради них
          незачем открывать карточку. */}
      {entry.canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-glass-brd pt-3">
          <Link
            href={`/library/entry/${entry.id}`}
            className="rounded-xl border border-glass-brd px-3 py-1.5 text-sm text-text-2 hover:text-text-0"
          >
            {t(locale, "entry.edit")}
          </Link>
          <DeleteEntryButton
            locale={locale}
            entryId={entry.id}
            onDeleted={onDeleted}
          />
        </div>
      )}
    </article>
  );
}

function PreviewImage({
  locale,
  src,
}: {
  locale: LibraryLocale;
  src: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- обложка лежит в нашем S3
    <img
      src={src}
      alt={t(locale, "entry.preview")}
      loading="lazy"
      className="aspect-video w-full object-cover"
    />
  );
}
