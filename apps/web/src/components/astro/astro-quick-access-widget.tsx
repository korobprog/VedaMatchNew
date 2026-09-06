import Link from "next/link";
import type { AstroQuickAccessData } from "@/lib/astro-quick-access";

/**
 * Транзит Луны сегодня в карточке «Астрологии» на главной.
 *
 * Карточка говорит «что на небе» фактами; советник рядом говорит «что это
 * значит» словами. Вместе читаются как заголовок и разбор. Ссылка поднята
 * над накладкой карточки (relative z-10), иначе нажатие вело бы в сервис
 * целиком, а не на персональный день.
 */
export function AstroQuickAccessWidget({
  moonLine,
  dashaLine,
}: AstroQuickAccessData) {
  if (!moonLine) return null;

  return (
    <div className="mb-4">
      <Link
        href="/astro#today"
        className="relative z-10 block rounded-xl border border-glass-brd bg-glass px-3 py-2 hover:border-gold/50"
      >
        <p className="text-[11px] text-text-2">Сегодня</p>
        <p className="text-sm font-medium leading-snug text-text-0">{moonLine}</p>
        {dashaLine && (
          <p className="mt-1 text-[11px] text-text-2">{dashaLine}</p>
        )}
      </Link>
    </div>
  );
}
