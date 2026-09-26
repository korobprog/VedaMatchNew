import Link from "next/link";
import {
  Bookmark,
  ExternalLink,
  ListOrdered,
  MessageSquare,
  Play,
  Users,
} from "lucide-react";
import {
  type LibraryEntryDto,
  type LibraryLocale,
  lineageOption,
} from "@vedamatch/shared";
import { videoEmbedUrl } from "@vedamatch/shared";
import { CoverPicture } from "./cover-picture";
import { CoverViewer } from "./cover-viewer";
import { DeleteEntryButton } from "./delete-entry-button";
import { EntryShareActions } from "./entry-share-actions";
import { OutsideLink } from "./outside-link";
import { entryTypeLabel, pickLocalized, t } from "./i18n";
import { VERSE_FONT_FAMILY, verseFontVariables } from "./shloka/shloka-font";
import { verseExcerpt } from "./shloka/shloka-mode";

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
            className="relative mb-3 block"
          >
            <PreviewImage locale={locale} src={entry.previewUrl} />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-bg-0/70 text-text-0">
                <Play aria-hidden className="ml-0.5 h-5 w-5" />
              </span>
            </span>
          </Link>
        ) : entry.url ? (
          <OutsideLink href={entry.url} className="mb-3 block">
            <PreviewImage locale={locale} src={entry.previewUrl} />
          </OutsideLink>
        ) : (
          // Без адреса открывать нечего, но обложку показываем: у материала
          // из книги и у катхи она единственное изображение и загружена
          // вручную. Нажатие открывает её во весь экран — с приближением и
          // «Скачать» (VED-138).
          <CoverViewer
            locale={locale}
            entryId={entry.id}
            src={entry.previewUrl}
            alt={t(locale, "entry.preview")}
            className="mb-3"
          >
            <PreviewImage locale={locale} src={entry.previewUrl} />
          </CoverViewer>
        ))}

      <div className="mb-2 flex items-center gap-2 text-xs text-text-2">
        {/* У материала без адреса домена нет — на его месте источник. У
            катхи может не быть ни того, ни другого, и тогда висящая точка в
            начале строки ни к чему. */}
        {(entry.domain ?? entry.source) && (
          <>
            <span>{entry.domain ?? entry.source}</span>
            <span aria-hidden>·</span>
          </>
        )}
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
        {/* Линия материала: коротко, чипом. Читателю — почему это здесь,
            редактору — правильно ли подписано. */}
        <span className="rounded-full border border-glass-brd px-2 py-0.5">
          {lineageOption(entry.lineage)?.shortLabel ??
            t(locale, "lineage.badgeAll")}
        </span>
      </div>

      <div className="mb-1 flex items-start justify-between gap-2">
        <h3 className="min-w-0 font-display text-base font-semibold text-text-0">
          {/* Без адреса открывать снаружи нечего — заголовок остаётся текстом,
              а куда смотреть, говорит строка источника выше. Катха — другое
              дело: её текст лежит у нас, и заголовок ведёт на её страницу. */}
          {entry.url ? (
            <OutsideLink href={entry.url} className="hover:underline">
              {title}
            </OutsideLink>
          ) : entry.type === "katha" || entry.type === "shloka" ? (
            <Link
              href={`/library/entry/${entry.id}`}
              className="hover:underline"
            >
              {title}
            </Link>
          ) : (
            title
          )}
        </h3>
        {/* «Открыть по ссылке» — отдельной кнопкой в размер пальца справа от
            заголовка (VED-512): значок в 14px в конце строки заголовка на
            телефоне было не попасть. */}
        {entry.url && (
          <OutsideLink
            href={entry.url}
            aria-label={t(locale, "entry.openLink")}
            className="-mr-1 -mt-1.5 inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-glass-brd text-text-1 transition-colors hover:border-cyan/60 hover:text-text-0"
          >
            <ExternalLink aria-hidden className="size-5" />
          </OutsideLink>
        )}
      </div>

      {/* Шлока показывает начало самого стиха — шрифтом для санскрита,
          как в её окне (VED-386). */}
      {entry.shloka && (
        <p
          className={`${verseFontVariables} mb-2 line-clamp-2 whitespace-pre-line text-[1.05rem] leading-7 text-text-0`}
          style={{ fontFamily: VERSE_FONT_FAMILY }}
        >
          {verseExcerpt(entry.shloka.text)}
        </p>
      )}

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

      {/* «Поделиться» и «В Блог-ленту» — всем (VED-490); автору и админу
          ещё правка и удаление: ради них незачем открывать карточку. */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-glass-brd pt-3">
        <EntryShareActions
          locale={locale}
          entryId={entry.id}
          title={title}
          blogSharedAt={entry.blogSharedAt}
        />
        {/* «Содержание» (VED-538) — у материалов со своим текстом: ведёт на
            страницу материала сразу к раскрытому списку разделов. */}
        {entry.hasText && (
          <Link
            href={`/library/entry/${entry.id}#contents`}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-glass-brd px-3 py-1.5 text-sm text-text-2 hover:text-text-0"
          >
            <ListOrdered aria-hidden className="size-4" />
            {t(locale, "entry.contents")}
          </Link>
        )}
        {entry.canEdit && (
          <>
            <Link
              href={`/library/entry/${entry.id}`}
              className="inline-flex min-h-9 items-center rounded-xl border border-glass-brd px-3 py-1.5 text-sm text-text-2 hover:text-text-0"
            >
              {t(locale, "entry.edit")}
            </Link>
            <DeleteEntryButton
              locale={locale}
              entryId={entry.id}
              onDeleted={onDeleted}
            />
          </>
        )}
      </div>
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
  return <CoverPicture src={src} alt={t(locale, "entry.preview")} lazy />;
}
