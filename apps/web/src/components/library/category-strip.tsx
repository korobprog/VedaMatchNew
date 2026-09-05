import Link from "next/link";
import { FileText, FolderTree } from "lucide-react";
import type { LibraryCategoryDto, LibraryLocale } from "@vedamatch/shared";
import { CategoryEditForm } from "./category-edit-form";
import { categoryCounter } from "./category-tree";
import {
  categoryCountLabel,
  categoryPageSummary,
  pickLocalized,
  t,
} from "./i18n";

/**
 * Рубрики одного уровня — сеткой, а не лентой: их немного, и все должны
 * быть видны сразу, без прокрутки и скрытых элементов.
 *
 * Чипы здесь только открывают. Перетаскивание живёт в отдельном режиме
 * «Упорядочить»: чип — ссылка, и совмещать на нём «открыть», «переставить»
 * и «вложить» значит промахиваться мимо двух намерений из трёх.
 *
 * Верхний уровень выглядит иначе, чем вложенный: прописными и крупнее, без
 * значков и без карандаша. Экраны раздела и подраздела отличались только
 * содержимым плиток, и, пролистав на два уровня вниз, человек не понимал, на
 * какой глубине он стоит. Разница в начертании отвечает на это до того, как
 * вопрос задан.
 */
export function CategoryStrip({
  categories,
  locale,
  activeSlug,
  root = false,
}: {
  categories: LibraryCategoryDto[];
  locale: LibraryLocale;
  activeSlug?: string;
  /** Верхний уровень портала — рубрики на `/library`, а не дети открытой. */
  root?: boolean;
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
          <div
            key={category.id}
            className={`glass flex flex-col gap-1 rounded-xl border px-3 py-2 text-sm transition-colors ${
              active ? "border-glass-brd" : "border-transparent"
            }`}
          >
            {/* Название — на своей строке и во всю ширину плитки: раньше
                делило место со значком счётчика и кнопкой редактирования, и
                на плитке шириной в пол-экрана длинное название обрезалось
                («Проповедники» → «Проповедни…») там, где вообще-то влезало
                бы целиком. */}
            <Link
              href={`/library/${category.slug}`}
              aria-current={active ? "page" : undefined}
              /* Верхний уровень переносится по строкам, а не обрезается:
                 прописные шире строчных, и «ФИЛОСОФИЯ И ПИСАНИЯ» в плитке
                 шириной в пол-экрана оборвалось бы на «ФИЛОСОФИЯ И…» — то
                 самое, ради чего со плитки убирали значки. Две строки
                 плитке по карману, многоточие вместо названия — нет.
                 Подразделы остаются в одну строку: их названия короче, и
                 плитки в сетке не должны прыгать по высоте. */
              className={`block transition-colors ${
                root
                  ? "line-clamp-2 font-display text-[15px] font-bold uppercase tracking-[0.02em]"
                  : "truncate font-medium"
              } ${active ? "text-text-0" : "text-text-1 hover:text-text-0"}`}
            >
              {pickLocalized(locale, {
                ru: category.titleRu,
                en: category.titleEn,
              })}
            </Link>
            {root ? (
              /* Число словами, а не значком с цифрой: значок убран по просьбе
                 освободить плитку, а «4» без него одинаково читается и как
                 четыре подраздела, и как четыре материала. Формулировка та
                 же, что в строке под названием на странице рубрики — одно
                 число не должно называться в двух местах по-разному. */
              <span className="truncate text-xs text-text-2">
                {categoryPageSummary(locale, category)}
              </span>
            ) : (
              <div className="flex items-center justify-between gap-2">
                {/* Значок стоит вплотную к числу, а не у названия: он и есть
                    единица измерения. Папка — подразделы, лист — материалы;
                    «4» без него одинаково читается и так, и так. Полная
                    подпись уходит в `aria-label` и во всплывающую. */}
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
                {/* Без обёртки в absolute: раньше форма редактирования, открываясь,
                    наследовала «right-2 top-2» от кнопки-триггера и растягивалась
                    поверх соседних плиток — её собственный `max-w-full`
                    (category-edit-form.tsx) не мог сработать без родителя
                    нормального потока, у которого есть реальная ширина. */}
                {category.canEdit && (
                  <CategoryEditForm locale={locale} category={category} />
                )}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
