import Link from "next/link";
import type { MotivationQuickAccessData } from "@/lib/motivation-quick-access";
import { plural } from "@/lib/plural";
import { reelsHref } from "./feed-style";

/**
 * Цитата дня в карточке «Вдохновения» на главной.
 *
 * Остальные карточки показывают состояние — прогресс, ожидающие; эта
 * показывает сам продукт: каплю вдохновения без перехода. Без картинки:
 * она тяжёлая и ломает сетку, а текст и есть суть.
 *
 * Ссылка поднята над накладкой карточки (relative z-10), иначе нажатие на
 * цитату вело бы на ленту целиком, а не на этот пост.
 *
 * `category` — папка, из которой взят афоризм (VED-401): цитата открывается
 * первой, а листается дальше та же папка, а не личная лента. Вкладку
 * («Лента» или «Открытки») страница ленты выбирает сама по посту.
 */
export function MotivationQuickAccessWidget({
  quote,
  freshMore,
  category,
}: MotivationQuickAccessData & { category?: string | null }) {
  if (!quote) return null;

  return (
    <div className="mb-4 space-y-1.5">
      <Link
        /* Цитата открывается на своём месте в папке и листается дальше по
           порядку (VED-432), а не первой перед началом папки. Без папки —
           личная лента, где порядка нет: там цитата просто первая. */
        href={
          category
            ? reelsHref({ from: quote.slug, category })
            : reelsHref({ post: quote.slug })
        }
        className="relative z-10 block rounded-xl border border-glass-brd bg-glass px-3 py-2 hover:border-gold/50"
      >
        {/* Текстовый шрифт, не заголовочный: Unbounded курсивом вмещал в две
            строки шесть слов, и цитата обрывалась на полуфразе. */}
        <p className="line-clamp-3 text-sm italic leading-snug text-text-0">
          {quote.text}
        </p>
        {quote.attribution && (
          <p className="mt-1 text-[11px] text-text-2">— {quote.attribution}</p>
        )}
      </Link>
      {freshMore > 0 && (
        <p className="text-[11px] text-text-2">
          и ещё {freshMore} {plural(freshMore, "новое", "новых", "новых")} с
          прошлого визита
        </p>
      )}
    </div>
  );
}
