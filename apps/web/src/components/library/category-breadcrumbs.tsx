import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { LibraryCategoryAncestor, LibraryLocale } from "@vedamatch/shared";
import { pickLocalized, t } from "./i18n";

/**
 * Путь до рубрики.
 *
 * Адрес рубрики плоский (`/library/<slug>`) и места в дереве не показывает —
 * это плата за то, что перемещение не рвёт чужие ссылки. Крошки возвращают
 * потерянный контекст: без них после переезда непонятно, где ты оказался.
 */
export function CategoryBreadcrumbs({
  locale,
  ancestors,
  current,
}: {
  locale: LibraryLocale;
  ancestors: LibraryCategoryAncestor[];
  current: string;
}) {
  return (
    <nav aria-label={t(locale, "nav.breadcrumbRoot")} className="mb-3">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-text-2">
        <li>
          <Link href="/library" className="hover:text-text-0">
            {t(locale, "nav.breadcrumbRoot")}
          </Link>
        </li>
        {ancestors.map((ancestor) => (
          <li key={ancestor.id} className="flex items-center gap-1">
            <ChevronRight aria-hidden className="h-3.5 w-3.5" />
            <Link
              href={`/library/${ancestor.slug}`}
              className="hover:text-text-0"
            >
              {pickLocalized(locale, {
                ru: ancestor.titleRu,
                en: ancestor.titleEn,
              })}
            </Link>
          </li>
        ))}
        <li className="flex items-center gap-1 text-text-1">
          <ChevronRight aria-hidden className="h-3.5 w-3.5" />
          <span aria-current="page">{current}</span>
        </li>
      </ol>
    </nav>
  );
}
