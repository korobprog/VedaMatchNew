import Link from "next/link";
import { FileText, FolderTree } from "lucide-react";
import type { LibraryCategoryDto, LibraryLocale } from "@vedamatch/shared";
import { CategoryEditForm } from "./category-edit-form";
import { categoryCounter } from "./category-tree";
import { categoryCountLabel, pickLocalized, t } from "./i18n";

/**
 * Рубрики одного уровня — сеткой, а не лентой: их немного, и все должны
 * быть видны сразу, без прокрутки и скрытых элементов.
 *
 * Чипы здесь только открывают. Перетаскивание живёт в отдельном режиме
 * «Упорядочить»: чип — ссылка, и совмещать на нём «открыть», «переставить»
 * и «вложить» значит промахиваться мимо двух намерений из трёх.
 */
export function CategoryStrip({
  categories,
  locale,
  activeSlug,
}: {
  categories: LibraryCategoryDto[];
  locale: LibraryLocale;
  activeSlug?: string;
}) {
  if (categories.length === 0) return null;

  return (
    <nav
      aria-label={t(locale, "nav.sections")}
      className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
    >
      {categories.map((category) => {
        const active = category.slug === activeSlug;
        const counter = categoryCounter(category);
        const counterLabel = categoryCountLabel(locale, category);
        return (
          <div key={category.id} className="relative">
            <Link
              href={`/library/${category.slug}`}
              aria-current={active ? "page" : undefined}
              className={`glass flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
                active
                  ? "border-glass-brd text-text-0"
                  : "border-transparent text-text-1 hover:text-text-0"
              } ${category.canEdit ? "pr-8" : ""}`}
            >
              <span className="truncate font-medium">
                {pickLocalized(locale, {
                  ru: category.titleRu,
                  en: category.titleEn,
                })}
              </span>
              {/* Значок стоит вплотную к числу, а не у названия: он и есть
                  единица измерения. Папка — подразделы, лист — материалы;
                  «4» без него одинаково читается и так, и так, а места под
                  слово в плитке шириной в пол-экрана нет. Полная подпись
                  уходит в `aria-label` и во всплывающую — там место есть. */}
              <span
                aria-label={counterLabel}
                title={counterLabel}
                className="flex shrink-0 items-center gap-1 font-mono text-xs text-text-2"
              >
                {counter.kind === "children" ? (
                  <FolderTree aria-hidden className="h-3.5 w-3.5" />
                ) : (
                  <FileText aria-hidden className="h-3.5 w-3.5" />
                )}
                {counter.value}
              </span>
            </Link>
            {category.canEdit && (
              <div className="absolute right-2 top-2 z-20">
                <CategoryEditForm locale={locale} category={category} />
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
