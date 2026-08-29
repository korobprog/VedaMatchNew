"use client";

import { useState } from "react";
import { ListTree } from "lucide-react";
import type {
  LibraryCategoryDto,
  LibraryCategoryTreeNode,
  LibraryLocale,
} from "@vedamatch/shared";
import { CategoryStrip } from "./category-strip";
import { LibraryTreeOrganizer } from "./tree-organizer";
import { t } from "./i18n";

/**
 * Переключатель «просмотр ↔ упорядочивание» над рубриками.
 *
 * Два режима вместо одного универсального: в просмотре чип — ссылка и
 * ничего кроме открытия не делает, в упорядочивании строки не ссылки и
 * жест однозначен. Кнопка видна только тем, кому дерево можно менять.
 *
 * Упорядочивают всегда всё дерево, а не только видимый уровень: вынести
 * рубрику наверх или переложить в соседнюю ветку иначе было бы неоткуда.
 */
export function CategoryNavigator({
  locale,
  categories,
  tree,
  activeSlug,
  canOrganize,
}: {
  locale: LibraryLocale;
  /** Рубрики текущего уровня — корни либо дети открытой рубрики. */
  categories: LibraryCategoryDto[];
  tree: LibraryCategoryTreeNode[];
  activeSlug?: string;
  canOrganize: boolean;
}) {
  const [organizing, setOrganizing] = useState(false);

  if (!canOrganize) {
    return (
      <CategoryStrip
        categories={categories}
        locale={locale}
        activeSlug={activeSlug}
      />
    );
  }

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={() => setOrganizing((current) => !current)}
          aria-pressed={organizing}
          className="inline-flex items-center gap-1.5 rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-2 hover:text-text-0"
        >
          <ListTree aria-hidden className="h-4 w-4" />
          {t(locale, organizing ? "tree.done" : "tree.organize")}
        </button>
      </div>

      {organizing ? (
        <LibraryTreeOrganizer locale={locale} initialTree={tree} />
      ) : (
        <CategoryStrip
          categories={categories}
          locale={locale}
          activeSlug={activeSlug}
        />
      )}
    </div>
  );
}
