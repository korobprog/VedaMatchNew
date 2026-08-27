"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Search, ShoppingBag } from "lucide-react";
import { VedaMatchMark } from "@/components/icons/vedamatch-mark";
import { TourFinger } from "./tour-cursor";
import {
  MARKET_CURSOR_TRAVEL,
  MARKET_DURATIONS,
  MARKET_TOUR_START,
  isListingOpen,
  isMarketPressing,
  marketCaption,
  nextMarketState,
  showcaseCards,
  type MarketShowcaseCard,
  type MarketTourState,
} from "@/lib/landing/market-tour";
import type { MarketListingSummary } from "@vedamatch/shared";
import { cn } from "@/lib/utils";

/**
 * Витрина Рынка на публичной странице сервиса.
 *
 * До неё страница была сплошным текстом: список возможностей, врезка и
 * кнопка «Создать аккаунт». У Знакомств и Астрологии там живые ролики, и
 * рядом с ними Рынок читался как обещание, а не как работающая площадка —
 * «не видно, что магазин работает».
 *
 * Объявления настоящие, с самой площадки. Выдуманный товар в витрине не
 * отвечает на единственный вопрос, который здесь задают; запасные карточки
 * появляются только когда API молчит или продавцов ещё нет.
 *
 * Целиком декоративна и скрыта от скринридера: то же самое сказано текстом
 * в разделе возможностей, а озвучка макета только удлинила бы путь.
 */
export function MarketMockup({
  listings,
  className,
}: {
  listings: MarketListingSummary[] | null;
  className?: string;
}) {
  const cards = showcaseCards(listings);
  const reduceMotion = useReducedMotion();
  const [tour, setTour] = useState<MarketTourState>(MARKET_TOUR_START);
  const [inView, setInView] = useState(false);
  const screenRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const running = !reduceMotion && inView;
  const index = running ? tour.index % cards.length : 0;
  const card = cards[index];
  const pressing = running && isMarketPressing(tour.phase);
  const opened = running && isListingOpen(tour.phase);

  useEffect(() => {
    const screen = screenRef.current;
    if (!screen || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.4 },
    );
    observer.observe(screen);
    return () => observer.disconnect();
  }, []);

  const aim = useCallback(() => {
    const screen = screenRef.current;
    const target = screen?.querySelector(`[data-market-card="${index}"]`);
    if (!screen || !target) return;
    const from = screen.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    setCursor({
      x: to.left - from.left + to.width / 2,
      y: to.top - from.top + to.height / 2,
    });
  }, [index]);

  useLayoutEffect(() => {
    if (!running) return;
    aim();
  }, [aim, running]);

  useEffect(() => {
    if (!running) return;
    window.addEventListener("resize", aim);
    return () => window.removeEventListener("resize", aim);
  }, [aim, running]);

  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(
      () => setTour((state) => nextMarketState(state, cards.length)),
      MARKET_DURATIONS[tour.phase],
    );
    return () => clearTimeout(timer);
  }, [running, tour, cards.length]);

  return (
    <div aria-hidden className={cn("relative select-none", className)}>
      <div className="relative mx-auto w-[300px] md:w-[320px]">
        <div className="relative rounded-[40px] border border-glass-brd bg-bg-2 p-2 shadow-2xl shadow-black/50">
          <div className="absolute left-1/2 top-4 z-20 h-7 w-32 -translate-x-1/2 rounded-full bg-bg-0" />

          <div
            ref={screenRef}
            className="relative overflow-hidden rounded-[32px] bg-bg-0"
          >
            <div className="flex items-center justify-between bg-bg-1/50 px-6 py-3">
              <span className="font-mono text-xs text-text-0">9:41</span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-1 rounded-sm bg-text-0" />
                <span className="h-3 w-1 rounded-sm bg-text-0" />
                <span className="h-4 w-1 rounded-sm bg-text-0" />
              </span>
            </div>

            <div className="flex items-center gap-2 px-4 py-3">
              <VedaMatchMark className="h-7 w-7" />
              <span className="font-display text-sm font-bold text-text-0">
                Рынок
              </span>
            </div>

            {/* Строка поиска: тур по ней не ходит, она одним взглядом
                говорит, что витрина ищется. */}
            <div className="mx-3 mb-3 flex h-8 items-center gap-2 rounded-xl border border-glass-brd bg-glass px-2.5">
              <Search className="h-3.5 w-3.5 text-text-2" />
              <span className="text-[11px] text-text-2">
                Книги, мала, прасад, услуги…
              </span>
            </div>

            {/* Высота фиксирована: без неё рамка телефона прыгала бы при
                каждом раскрытии карточки. */}
            <div className="relative mx-3 mb-4 h-[268px]">
              <div className="grid grid-cols-2 gap-2">
                {cards.map((item, cardIndex) => (
                  <ShowcaseCard
                    key={item.id}
                    card={item}
                    index={cardIndex}
                    active={running && cardIndex === index}
                  />
                ))}
              </div>

              {opened && <OpenedCard card={card} />}
            </div>

            {running && cursor && (
              <div
                className="pointer-events-none absolute left-0 top-0 z-40 transition-transform ease-in-out"
                style={{
                  transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)`,
                  transitionDuration: `${MARKET_CURSOR_TRAVEL}ms`,
                }}
              >
                <TourFinger pressing={pressing} />
              </div>
            )}
          </div>
        </div>

        {running && (
          <p
            key={marketCaption(tour.phase)}
            className="preview-screen-in mx-auto mt-5 flex min-h-[3.5rem] max-w-[19rem] items-start justify-center text-center text-sm leading-snug text-text-1"
          >
            {marketCaption(tour.phase)}
          </p>
        )}

        <div className="absolute -inset-4 -z-10 bg-gradient-to-r from-gold/20 via-magenta/20 to-cyan/20 opacity-50 blur-xl" />
      </div>
    </div>
  );
}

/** Плитка витрины. */
function ShowcaseCard({
  card,
  index,
  active,
}: {
  card: MarketShowcaseCard;
  index: number;
  active: boolean;
}) {
  return (
    <div
      data-market-card={index}
      className={cn(
        "overflow-hidden rounded-xl border bg-glass transition-colors duration-200",
        active ? "border-mint-edge" : "border-glass-brd",
      )}
    >
      <span className="relative block h-[68px] w-full overflow-hidden bg-bg-2">
        {card.imageUrl ? (
          // Подписанные ссылки хранилища ходят с разных хостов — Next Image
          // не может перечислить их источники.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.imageUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            draggable={false}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            <ShoppingBag className="h-6 w-6 text-text-2" />
          </span>
        )}
      </span>
      <span className="block px-2 py-1.5">
        <span className="line-clamp-2 block text-[10px] leading-tight text-text-1">
          {card.title}
        </span>
        <span className="mt-1 block font-mono text-[11px] font-bold text-text-0">
          {card.price}
        </span>
      </span>
    </div>
  );
}

/** Раскрытая карточка поверх витрины. */
function OpenedCard({ card }: { card: MarketShowcaseCard }) {
  return (
    <div className="preview-screen-in absolute inset-0 flex flex-col overflow-hidden rounded-xl border border-glass-brd bg-bg-0">
      <span className="relative block h-[120px] w-full overflow-hidden bg-bg-2">
        {card.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.imageUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            draggable={false}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            <ShoppingBag className="h-8 w-8 text-text-2" />
          </span>
        )}
      </span>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-2.5">
        <span className="line-clamp-2 text-[11px] font-semibold leading-tight text-text-0">
          {card.title}
        </span>
        <span className="font-mono text-base font-bold text-text-0">
          {card.price}
        </span>
        <span className="text-[10px] text-text-2">
          {card.shopName}
          {card.city ? ` · ${card.city}` : ""}
        </span>
        <span className="mt-auto flex gap-1.5">
          <span className="btn-mint flex-1 rounded-lg py-1.5 text-center text-[10px] font-semibold">
            В корзину
          </span>
          <span className="flex-1 rounded-lg border border-glass-brd py-1.5 text-center text-[10px] font-semibold text-text-1">
            Написать
          </span>
        </span>
      </div>
    </div>
  );
}

