"use client";

import { useEffect, useMemo, useState } from "react";
import { ListTree } from "lucide-react";
import type {
  LibraryCategoryDto,
  LibraryCategoryTreeNode,
  LibraryLocale,
} from "@vedamatch/shared";
import { CategoryStrip } from "./category-strip";
import { LibraryTreeOrganizer } from "./tree-organizer";
import {
  LIBRARY_CATEGORY_ORDERS,
  isCategoryOrder,
  sortCategories,
  type LibraryCategoryOrder,
} from "./category-order";
import { t } from "./i18n";

/**
 * Переключатель «просмотр ↔ упорядочивание» над рубриками и выбор порядка.
 *
 * Два режима вместо одного универсального: в просмотре чип — ссылка и
 * ничего кроме открытия не делает, в упорядочивании строки не ссылки и
 * жест однозначен. Кнопка видна только тем, кому дерево можно менять.
 *
 * Упорядочивают всегда всё дерево, а не только видимый уровень: вынести
 * рубрику наверх или переложить в соседнюю ветку иначе было бы неоткуда.
 *
 * Порядок показа — дело читателя, а не дерева: выбор живёт на устройстве и
 * никому больше рубрики не переставляет. Поэтому он есть у всех, а кнопка
 * «Упорядочить» — только у тех, кто меняет дерево для всех.
 */

/** Выбранный порядок помним между переходами: иначе его выбирают заново на
 *  каждой странице рубрики, и выбор теряет смысл. */
const ORDER_KEY = "vedamatch:library-category-order";

export function CategoryNavigator({
  locale,
  categories,
  tree,
  activeSlug,
  canOrganize,
  root = false,
}: {
  locale: LibraryLocale;
  /** Рубрики текущего уровня — корни либо дети открытой рубрики. */
  categories: LibraryCategoryDto[];
  tree: LibraryCategoryTreeNode[];
  activeSlug?: string;
  canOrganize: boolean;
  /** Показываем верхний уровень портала: полоса рисует его крупно. */
  root?: boolean;
}) {
  const [organizing, setOrganizing] = useState(false);
  const [order, setOrder] = useState<LibraryCategoryOrder>("own");

  /* Читаем эффектом, а не ленивым `useState`: на сервере `localStorage` нет,
     инициализатор вернул бы «свой порядок», а на клиенте — сохранённый, и
     это расхождение гидратации. Тем же способом читают своё значение
     `theme-provider` и полоса плеера. */
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- см. комментарий выше:
       ленивый useState здесь даёт расхождение гидратации. */
    try {
      const stored = window.localStorage.getItem(ORDER_KEY);
      if (isCategoryOrder(stored)) setOrder(stored);
    } catch {
      // Приватный режим и запрет хранилища — не повод не работать.
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const shown = useMemo(
    () => sortCategories(categories, order, locale),
    [categories, order, locale],
  );

  function chooseOrder(next: LibraryCategoryOrder) {
    setOrder(next);
    try {
      window.localStorage.setItem(ORDER_KEY, next);
    } catch {
      // см. выше
    }
  }

  const strip = (
    <CategoryStrip
      categories={shown}
      locale={locale}
      activeSlug={activeSlug}
      root={root}
    />
  );

  // Одна рубрика в любом порядке стоит одинаково — выбор был бы издевательством.
  const showOrder = categories.length > 1;

  if (!canOrganize && !showOrder) return strip;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
        {showOrder && (
          <label className="inline-flex items-center gap-1.5 text-sm text-text-2">
            {t(locale, "order.label")}
            <select
              value={order}
              onChange={(event) => {
                const next = event.target.value;
                if (isCategoryOrder(next)) chooseOrder(next);
              }}
              className="rounded-xl border border-glass-brd bg-bg-0 px-2 py-2 text-sm text-text-0"
            >
              {LIBRARY_CATEGORY_ORDERS.map((value) => (
                <option key={value} value={value}>
                  {t(locale, `order.${value}` as never)}
                </option>
              ))}
            </select>
          </label>
        )}

        {canOrganize && (
          <button
            type="button"
            onClick={() => setOrganizing((current) => !current)}
            aria-pressed={organizing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-2 hover:text-text-0"
          >
            <ListTree aria-hidden className="h-4 w-4" />
            {t(locale, organizing ? "tree.done" : "tree.organize")}
          </button>
        )}
      </div>

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
