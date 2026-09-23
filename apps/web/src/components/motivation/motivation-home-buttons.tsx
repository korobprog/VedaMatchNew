import Link from "next/link";
import { BookOpen, Images } from "lucide-react";
import type { HomeButtons } from "./home-buttons";

/**
 * Две кнопки в шапке карточки «Вдохновения» на главной (VED-401, на
 * скриншоте заказчика — справа от названия): лента одного источника и
 * открытки одной папки. Что именно открывают, решает участник в
 * «Настройках ленты»; по умолчанию — Бхагавад-гита и «Мудрость мира».
 *
 * Значки без подписи: шапка карточки на 320px вмещает знак сервиса,
 * название и две клетки (36px, нажатие 44px), но не слова. Полное имя — «Лента:
 * Бхагавад-гита», «Открытки: Мудрость мира» — в `aria-label` и `title`.
 *
 * `relative z-10` — над накладкой карточки: область нажатия названия
 * растянута на всю карточку (`after:inset-0` в `ServiceCard`), и без
 * подъёма нажатие на значок открывало бы сервис целиком.
 */
export function MotivationHomeButtons({ buttons }: { buttons: HomeButtons }) {
  /* VED-432: «сделай немного поменьше». Видимая клетка 36px вместо 44, а
     область нажатия прежняя, 44×44: прозрачный `before:` выступает на 4px
     с каждой стороны. Промежуток 8px, чтобы области соседей не
     перекрывались. */
  const cell =
    "relative z-10 inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-glass-brd bg-glass text-text-1 transition-colors before:absolute before:-inset-1 before:content-[''] hover:border-gold/50 hover:text-text-0";
  const sourceName = `Лента: ${buttons.source.title}`;
  const cardsName = buttons.cards ? `Открытки: ${buttons.cards.title}` : null;

  return (
    <div role="group" aria-label="Быстрые ленты Вдохновения" className="flex shrink-0 gap-2">
      <Link
        href={buttons.source.href}
        aria-label={sourceName}
        title={sourceName}
        className={cell}
      >
        <BookOpen aria-hidden className="size-[18px]" />
      </Link>
      {buttons.cards && cardsName && (
        <Link
          href={buttons.cards.href}
          aria-label={cardsName}
          title={cardsName}
          className={cell}
        >
          <Images aria-hidden className="size-[18px]" />
        </Link>
      )}
    </div>
  );
}
