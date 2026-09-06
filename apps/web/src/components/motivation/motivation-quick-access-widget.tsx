import Link from "next/link";
import type { MotivationQuickAccessData } from "@/lib/motivation-quick-access";
import { plural } from "@/lib/plural";

/**
 * Цитата дня в карточке «Вдохновения» на главной.
 *
 * Остальные карточки показывают состояние — прогресс, ожидающие; эта
 * показывает сам продукт: каплю вдохновения без перехода. Без картинки:
 * она тяжёлая и ломает сетку, а текст и есть суть.
 *
 * Ссылка поднята над накладкой карточки (relative z-10), иначе нажатие на
 * цитату вело бы на ленту целиком, а не на этот пост.
 */
export function MotivationQuickAccessWidget({
  quote,
  freshMore,
}: MotivationQuickAccessData) {
  if (!quote) return null;

  return (
    <div className="mb-4 space-y-1.5">
      <Link
        href={`/motivation?post=${encodeURIComponent(quote.slug)}`}
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
