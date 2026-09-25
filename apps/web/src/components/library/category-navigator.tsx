"use client";

import { useSyncExternalStore } from "react";
import type {
  LibraryCategoryDto,
  LibraryCategoryTreeNode,
  LibraryLocale,
} from "@vedamatch/shared";
import { CategoryStrip } from "./category-strip";
import { LibraryTreeOrganizer } from "./tree-organizer";
import { LibraryOrganizeButton } from "./organize-button";
import {
  getOrganizing,
  getOrganizingServer,
  subscribeOrganizing,
} from "./organize-state";

/**
 * Переключатель «просмотр ↔ упорядочивание» над рубриками.
 *
 * Выбор порядка показа («Свой порядок», алфавит, дата) убран (VED-483):
 * заказчику «достаточно одной кнопки Упорядочить» — рубрики стоят в том
 * порядке, который выставили перетаскиванием.
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
  root = false,
  organizeInToolbar = false,
}: {
  locale: LibraryLocale;
  /** Рубрики текущего уровня — корни либо дети открытой рубрики. */
  categories: LibraryCategoryDto[];
  tree: LibraryCategoryTreeNode[];
  activeSlug?: string;
  canOrganize: boolean;
  /** Показываем верхний уровень портала: полоса рисует его крупно. */
  root?: boolean;
  /**
   * Кнопка «Упорядочить» стоит в ряду кнопок страницы
   * (`LibraryOrganizeButton`), а не над рубриками (VED-483).
   */
  organizeInToolbar?: boolean;
}) {
  const organizing = useSyncExternalStore(
    subscribeOrganizing,
    getOrganizing,
    getOrganizingServer,
  );

  const strip = (
    <CategoryStrip
      categories={categories}
      locale={locale}
      activeSlug={activeSlug}
      root={root}
    />
  );

  if (!canOrganize) return strip;

  return (
    <div>
      {!organizeInToolbar && (
        <div className="mb-2 flex justify-end">
          <LibraryOrganizeButton locale={locale} />
        </div>
      )}

      {/* Упорядочивание всегда показывает настоящий порядок дерева: тянуть
          строку в списке, отсортированном по алфавиту, значит перекладывать
          вслепую — на глазах она встанет не туда, куда её положили. */}
      {organizing ? (
        <LibraryTreeOrganizer locale={locale} initialTree={tree} />
      ) : (
        strip
      )}
    </div>
  );
}
