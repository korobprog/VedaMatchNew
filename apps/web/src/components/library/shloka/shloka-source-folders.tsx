import Link from "next/link";
import { Folder, Plus } from "lucide-react";
import type {
  LibraryLocale,
  LibraryShlokaSourcesResponse,
} from "@vedamatch/shared";
import { addShlokaHref, folderTitle, shlokaFolderHref } from "./shloka-folders";
import { shlokaCount, st } from "./shloka-text";

/**
 * Рубрика «Шлоки» (VED-465): вместо общей ленты — папки по источнику,
 * как в библиотеке: «Бхагавад-гита», «Шримад-Бхагаватам»… Плитка — как у
 * подрубрик Образования: имя в одну строку, справа число шлок.
 */
export function ShlokaSourceFolders({
  locale,
  categorySlug,
  sources,
}: {
  locale: LibraryLocale;
  categorySlug: string;
  sources: LibraryShlokaSourcesResponse;
}) {
  return (
    <section aria-labelledby="shloka-folders-heading" className="mb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2
          id="shloka-folders-heading"
          className="font-display text-lg font-bold text-text-0"
        >
          {st(locale, "folders.title")}
          <span className="ml-2 text-sm font-normal text-text-2">
            {shlokaCount(locale, sources.total)}
          </span>
        </h2>
        <Link
          href={addShlokaHref(categorySlug)}
          className="btn-mint inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold shadow-[0_0_12px_var(--vm-glow-mint)]"
        >
          <Plus aria-hidden className="h-4 w-4" />
          {st(locale, "section.add")}
        </Link>
      </div>

      {sources.folders.length === 0 ? (
        <p className="glass rounded-2xl border border-glass-brd p-5 text-sm text-text-1">
          {st(locale, "folders.empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sources.folders.map((folder) => {
            const title = folderTitle(locale, folder);
            const count = shlokaCount(locale, folder.count);
            return (
              <li key={folder.key}>
                <Link
                  href={shlokaFolderHref(categorySlug, folder.key)}
                  className={`glass flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-transparent px-3 text-sm text-text-1 transition-colors hover:border-glass-brd hover:text-text-0 motion-reduce:transition-none ${
                    folder.label === null ? "italic" : ""
                  }`}
                >
                  <Folder
                    aria-hidden
                    className="h-4 w-4 shrink-0 text-text-2"
                  />
                  <span className="min-w-0 truncate py-2 font-medium">
                    {title}
                  </span>
                  <span className="sr-only">, {count}</span>
                  <span
                    aria-hidden
                    title={count}
                    className="ml-auto shrink-0 font-mono text-xs text-text-2"
                  >
                    {folder.count}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
