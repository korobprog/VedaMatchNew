import Link from "next/link";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import type {
  LibraryLocale,
  LibraryShlokaLine,
  LibraryShlokaSourceLinesResponse,
} from "@vedamatch/shared";
import { VERSE_FONT_FAMILY, verseFontVariables } from "./shloka-font";
import { addShlokaHref, folderTitle } from "./shloka-folders";
import { shlokaHref } from "./shloka-mode";
import { shlokaCount, st } from "./shloka-text";

/**
 * Папка-источник (VED-465): все шлоки произведения одним списком, по
 * строке на стих — номер и первая строка стиха (без оригинала — начало
 * перевода). Строка открывает шлоку, карандаш — её форму правки.
 */
export function ShlokaFolderList({
  locale,
  categorySlug,
  data,
}: {
  locale: LibraryLocale;
  categorySlug: string;
  data: LibraryShlokaSourceLinesResponse;
}) {
  const title = folderTitle(locale, data.folder);
  return (
    <section aria-labelledby="shloka-folder-heading" className="mb-8">
      <Link
        href={`/library/${encodeURIComponent(categorySlug)}`}
        className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm text-text-1 hover:text-text-0"
      >
        <ArrowLeft aria-hidden className="h-4 w-4" />
        {st(locale, "folder.back")}
      </Link>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2
          id="shloka-folder-heading"
          className="min-w-0 break-words font-display text-lg font-bold text-text-0"
        >
          {title}
          <span className="ml-2 text-sm font-normal text-text-2">
            {shlokaCount(locale, data.items.length)}
          </span>
        </h2>
        <Link
          href={addShlokaHref(categorySlug, data.folder.label)}
          className="btn-mint inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold shadow-[0_0_12px_var(--vm-glow-mint)]"
        >
          <Plus aria-hidden className="h-4 w-4" />
          {st(locale, "section.add")}
        </Link>
      </div>

      <ol
        aria-label={st(locale, "folder.list")}
        className={`${verseFontVariables} glass divide-y divide-glass-brd rounded-2xl border border-glass-brd`}
      >
        {data.items.map((item) => (
          <ShlokaLineRow key={item.id} locale={locale} item={item} />
        ))}
      </ol>
    </section>
  );
}

function ShlokaLineRow({
  locale,
  item,
}: {
  locale: LibraryLocale;
  item: LibraryShlokaLine;
}) {
  const verse = item.verse ?? st(locale, "section.noVerse");
  return (
    <li className="flex min-w-0 items-center">
      <Link
        href={shlokaHref(item.id)}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 px-3 py-2 text-text-0 hover:text-text-0 hover:underline"
      >
        {/* Неразрывный дефис: диапазон «2.62-63» не рвётся на две строки. */}
        <span className="min-w-14 max-w-32 shrink-0 truncate font-mono text-[13px] text-text-1">
          {verse.replace(/-/g, "\u2011")}
        </span>
        <span
          className={`min-w-0 truncate ${item.lineFrom === "translation" ? "text-sm text-text-1" : "text-[1.05rem]"}`}
          style={
            item.lineFrom === "text"
              ? { fontFamily: VERSE_FONT_FAMILY }
              : undefined
          }
        >
          {item.line}
        </span>
      </Link>
      {item.canEdit && (
        <Link
          href={shlokaHref(item.id, true)}
          aria-label={`${st(locale, "folder.edit")} ${verse}`}
          title={st(locale, "folder.edit")}
          className="mr-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-text-1 hover:text-text-0"
        >
          <Pencil aria-hidden className="h-4 w-4" />
        </Link>
      )}
    </li>
  );
}
