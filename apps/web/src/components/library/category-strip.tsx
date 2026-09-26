import Link from "next/link";
import { FileText, FolderTree } from "lucide-react";
import type { LibraryCategoryDto, LibraryLocale } from "@vedamatch/shared";
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
 * значков. Экраны раздела и подраздела отличались только
 * содержимым плиток, и, пролистав на два уровня вниз, человек не понимал, на
 * какой глубине он стоит. Разница в начертании отвечает на это до того, как
 * вопрос задан.
 *
 * Вложенные рубрики — это чаще всего авторы («Проповедники → Ари Мардан
 * Прабху»), и плитка у них в одну строку (VED-528): имя, справа число.
 * Карандаша нет — имя правят на странице самого автора. Ширина плитки — по
 * имени: короткое не держит пол-экрана, и длинному соседу достаётся место
 * целиком; не влезает и в строку — многоточие, но число остаётся видно.
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
      className={
        root
          ? "mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
          : "mb-6 flex flex-wrap gap-2"
      }
    >
      {categories.map((category) => {
        const active = category.slug === activeSlug;
        const counter = categoryCounter(category);
        const counterLabel = categoryCountLabel(locale, category);
        return (
          <div
            key={category.id}
            className={`glass rounded-xl border px-3 text-sm transition-colors ${
              root
                ? "flex flex-col gap-1 py-2"
                : "flex min-h-11 max-w-full min-w-0 flex-auto items-center gap-2"
            } ${active ? "border-glass-brd" : "border-transparent"}`}
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
                 плитки в сетке не должны прыгать по высоте.

                 Перенос по строкам не спасает одно длинное слово: переносить
                 его некуда. «ПРОПОВЕДНИКИ» кеглем 15 занимает 170 точек, а
                 места в плитке на телефоне шириной 375 — 144, и край срезал
                 его до «ПРОПОВЕДНИИ». Замер Unbounded: 14 — 159, 13 — 148
                 (всё ещё не влезает), 12 — 136. Отсюда 12 до ширины sm, где
                 плиток три в ряд и 15 снова помещается.

                 Перенос по слогам и разрыв слова — страховка на экраны уже
                 360 точек и на будущие рубрики длиннее: слово переедет на
                 вторую строку, но не исчезнет за краем. */
              className={`block transition-colors ${
                root
                  ? "line-clamp-2 break-words hyphens-auto font-display text-[12px] font-bold uppercase tracking-[0.02em] sm:text-[15px]"
                  : "min-w-0 truncate py-2 font-medium"
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
              /* Число — справа от имени, в той же строке (VED-528). Значок
                 стоит вплотную к числу: он и есть единица измерения. Папка —
                 подразделы, лист — материалы; полная подпись уходит в
                 `aria-label` и во всплывающую. */
              <span
                aria-label={counterLabel}
                title={counterLabel}
                className="ml-auto flex shrink-0 items-center gap-1 font-mono text-xs text-text-2"
              >
                {counter.kind === "children" ? (
                  <FolderTree aria-hidden className="h-3.5 w-3.5" />
                ) : (
                  <FileText aria-hidden className="h-3.5 w-3.5" />
                )}
                {counter.value}
              </span>
            )}
          </div>
        );
      })}
    </nav>
  );
}
