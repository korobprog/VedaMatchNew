import Link from "next/link";
import type { LibraryQuickAccessData } from "@/lib/library-quick-access";
import { plural } from "@/lib/plural";
import { entryTypeLabel } from "./i18n";

/**
 * Свежий материал в карточке «Образования» на главной.
 *
 * Тот же принцип, что у цитаты дня во «Вдохновении»: карточка показывает
 * продукт, а не состояние. Ссылка поднята над накладкой карточки
 * (relative z-10), иначе нажатие вело бы на каталог целиком, а не на
 * материал.
 */
export function LibraryQuickAccessWidget({
  latest,
  weekCount,
  weekCountCapped,
}: LibraryQuickAccessData) {
  if (!latest) return null;

  const meta = [entryTypeLabel("ru", latest.type), latest.rubric]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mb-4 space-y-1.5">
      <Link
        href={`/library/entry/${encodeURIComponent(latest.id)}`}
        className="relative z-10 block rounded-xl border border-glass-brd bg-glass px-3 py-2 hover:border-gold/50"
      >
        <p className="text-[11px] text-text-2">
          {latest.isFresh ? "Новое в каталоге" : "Последнее в каталоге"}
        </p>
        <p className="line-clamp-2 text-sm font-medium leading-snug text-text-0">
          {latest.title}
        </p>
        {meta && <p className="mt-1 text-[11px] text-text-2">{meta}</p>}
      </Link>
      {weekCount > 0 && (
        <p className="text-[11px] text-text-2">
          за неделю добавлено {weekCount}
          {weekCountCapped ? "+" : ""}{" "}
          {plural(weekCount, "материал", "материала", "материалов")}
        </p>
      )}
    </div>
  );
}
