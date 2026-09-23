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
 * название и две клетки по 44px, но не слова. Полное имя — «Лента:
 * Бхагавад-гита», «Открытки: Мудрость мира» — в `aria-label` и `title`.
 *
 * `relative z-10` — над накладкой карточки: область нажатия названия
 * растянута на всю карточку (`after:inset-0` в `ServiceCard`), и без
 * подъёма нажатие на значок открывало бы сервис целиком.
 */
export function MotivationHomeButtons({ buttons }: { buttons: HomeButtons }) {
  const cell =
    "relative z-10 inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-glass-brd bg-glass text-text-1 transition-colors hover:border-gold/50 hover:text-text-0";
  const sourceName = `Лента: ${buttons.source.title}`;
  const cardsName = buttons.cards ? `Открытки: ${buttons.cards.title}` : null;

  return (
    <div role="group" aria-label="Быстрые ленты Вдохновения" className="flex shrink-0 gap-1">
      <Link
        href={buttons.source.href}
        aria-label={sourceName}
        title={sourceName}
        className={cell}
      >
        <BookOpen aria-hidden className="size-5" />
      </Link>
      {buttons.cards && cardsName && (
        <Link
          href={buttons.cards.href}
          aria-label={cardsName}
          title={cardsName}
          className={cell}
        >
          <Images aria-hidden className="size-5" />
        </Link>
      )}
    </div>
  );
}
