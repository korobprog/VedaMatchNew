"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useReducedMotion } from "framer-motion";
import type {
  AstroCompatibilityPurpose,
  UnionShowcaseCard,
} from "@vedamatch/shared";
import { VedaMatchMark } from "@/components/icons/vedamatch-mark";
import { SwipeCard } from "./SwipeCard";
import { TourFinger } from "./tour-cursor";
import {
  COMPATIBILITY_CRITERIA,
  type BreakdownRow,
} from "./deck-controls";
import {
  exampleBreakdown,
  exampleCompatibility,
} from "@/lib/landing/compatibility-example";
import {
  DECK_STEPS,
  DECK_TOUR_START,
  cursorTarget,
  cursorTravelFor,
  durationFor,
  isDeckPressing,
  nextDeckState,
  openPanel,
  replyFor,
  shouldAdvanceCard,
  type DeckPanel,
  type DeckTourState,
} from "@/lib/landing/deck-tour";
import { cn } from "@/lib/utils";

interface PhoneMockupProps {
  className?: string;
  /**
   * Анкеты тех, кто согласился на публичный показ. Пусто или не передано —
   * витрина падает на демонстрационные карточки: страница сервиса не должна
   * пустовать, пока согласившихся нет.
   */
  cards?: UnionShowcaseCard[];
}

interface DeckCard {
  id: string;
  name: string;
  age: number | null;
  location: string | null;
  description: string | null;
  imageUrl: string;
  /** Считается относительно смотрящего, поэтому есть только у демо-карточек. */
  compatibility?: number;
  /** Разбор процента; тоже только у демо — у витрины считать его не для кого. */
  breakdown?: BreakdownRow[];
  tags: string[];
}

/**
 * Разбор демо-анкеты. Оценки придуманы — люди тоже, — но арифметика честная:
 * итог равен сумме оценок по весам, как его считает сервер. Разъедься они, и
 * витрина показывала бы расчёт, который сама же не сходится; сумму стережёт
 * тест в deck-controls.spec.tsx.
 */
function demoBreakdown(scores: number[]): BreakdownRow[] {
  return COMPATIBILITY_CRITERIA.map((row, index) => ({
    ...row,
    score: scores[index],
  }));
}

/**
 * Витрина сама себя показывает: курсор обходит кнопки под карточкой, на
 * каждой рассказывает, что произойдёт, нажимает — и показывает ответ
 * сервиса. Раньше здесь было слепое автолистание раз в 5 секунд: карточки
 * менялись, но гость не узнавал, что вообще делают эти три кнопки.
 *
 * Шаги и формулировки — в lib/landing/deck-tour.ts, они повторяют настоящие
 * решения swipe-deck.tsx.
 */

/**
 * Запасная колода: показывается, пока никто не согласился на витрину.
 * Экспортируется ради теста: он сверяет, что процент каждой анкеты равен её
 * же разбору по весам.
 */
export const demoProfiles: DeckCard[] = [
  {
    id: "demo-1",
    name: "Александра",
    age: 28,
    location: "Москва, Россия",
    description: "Йогиня с 8-летним опытом. Люблю медитацию на рассвете и киртаны по вечерам. Ищу единомышленников для совместной практики и служения.",
    imageUrl: "/landing/profiles/alexandra.jpg",
    compatibility: 94,
    breakdown: demoBreakdown([100, 95, 90, 96, 92, 85, 95]),
    tags: ["Йога", "Медитация", "Киртан"],
  },
  {
    id: "demo-2",
    name: "Мария",
    age: 32,
    location: "Санкт-Петербург, Россия",
    description: "Практикую крийи и пранаяму каждый день. Интересуюсь ведической философией и аюрведой. Открыта к новым знакомствам.",
    imageUrl: "/landing/profiles/maria.jpg",
    compatibility: 87,
    breakdown: demoBreakdown([90, 85, 88, 90, 84, 80, 88]),
    tags: ["Крия", "Аюрведа", "Философия"],
  },
  {
    id: "demo-3",
    name: "Екатерина",
    age: 26,
    location: "Казань, Россия",
    description: "На пути йоги уже 5 лет. Веду группу по субботам, организую ретриты. Ищу партнёра для духовных проектов и семейной жизни.",
    imageUrl: "/landing/profiles/ekaterina.jpg",
    compatibility: 91,
    breakdown: demoBreakdown([95, 92, 88, 92, 90, 85, 88]),
    tags: ["Ретриты", "Служение", "Групповая практика"],
  },
];

/** Город и страна одной строкой; пусто, когда закрыты приватностью. */
function toLocationLine(card: UnionShowcaseCard): string | null {
  return [card.city, card.country].filter(Boolean).join(", ") || null;
}

export function PhoneMockup({ className, cards }: PhoneMockupProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const reduceMotion = useReducedMotion();

  const [tour, setTour] = useState<DeckTourState>(DECK_TOUR_START);
  const screenRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  /**
   * Ролик стартует выключенным и включается уже в браузере: сервер не знает
   * ни про `prefers-reduced-motion`, ни про то, виден ли макет, — а разойтись
   * с разметкой сервера при гидратации нельзя.
   */
  const [inView, setInView] = useState(false);

  const step = DECK_STEPS[tour.index];
  const running = !reduceMotion && inView;
  const pressing = running && isDeckPressing(tour.phase);
  const reply = running ? replyFor(tour, DECK_STEPS) : null;

  /**
   * Разбор открывает ролик на своём шаге, а гость может решить иначе —
   * открыть его раньше или закрыть крестиком.
   *
   * Решение гостя привязано к шагу и снимается вместе с ним, а не живёт
   * отдельным флагом: иначе открытая руками панель висела бы поверх колоды,
   * пока ролик вслепую жмёт кнопки под ней. Привязка к шагу заодно оживляет
   * крестик во время самого шага разбора — без неё ролик тут же открывал бы
   * панель обратно.
   */
  const [override, setOverride] = useState<{
    at: number;
    panel: DeckPanel;
  } | null>(null);

  const tourPanel = running ? openPanel(tour, DECK_STEPS) : null;
  const panel = override?.at === tour.index ? override.panel : tourPanel;
  const breakdownOpen = panel === "breakdown";
  const astroMenuOpen = panel === "astroMenu";
  const astroOpen = panel === "astro";
  /**
   * Гость решил не как ролик — открыл панель сам или закрыл её крестиком.
   * Пока на экране его панель, ролик ждёт: иначе он продолжал бы жать
   * кнопки, спрятанные под ней, — на экране разбор, а палец тычет в невидимое.
   */
  const paused = panel !== tourPanel;

  /**
   * Цель сверки, выбранная в меню. Ролик ставит её своим шагом, гость —
   * нажатием; и то и другое меняет, какие куты попадут в расчёт.
   */
  const [astroPurpose, setAstroPurpose] =
    useState<AstroCompatibilityPurpose>("family");

  /** Открыть или закрыть панель руками — с привязкой к текущему шагу. */
  const toggle = (kind: Exclude<DeckPanel, null>) =>
    setOverride({ at: tour.index, panel: panel === kind ? null : kind });

  const deck: DeckCard[] =
    cards && cards.length > 0
      ? cards.map((card) => {
          // Настоящего процента у витрины нет — он считается относительно
          // смотрящего. Пустое кольцо прятало бы главную идею сервиса,
          // поэтому здесь пример: постоянный для анкеты и с честной
          // арифметикой, а что это пример — сказано в разборе.
          const example = exampleCompatibility(card.id);
          return {
            id: card.id,
            name: card.name,
            age: card.age,
            location: toLocationLine(card),
            description: card.about,
            imageUrl: card.photoUrl,
            compatibility: example,
            breakdown: exampleBreakdown(example),
            tags: card.interests,
          };
        })
      : demoProfiles;

  const advance = useCallback(
    (move: "next" | "prev" = "next") => {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentIndex((prev) =>
          move === "prev"
            ? (prev - 1 + deck.length) % deck.length
            : (prev + 1) % deck.length,
        );
        setIsAnimating(false);
      }, 300);
    },
    [deck.length],
  );

  const handleSwipe = () => {
    if (isAnimating) return;
    advance();
  };

  const handleUndo = () => {
    if (isAnimating) return;
    advance("prev");
  };

  useEffect(() => {
    const screen = screenRef.current;
    // Без IntersectionObserver (jsdom в тестах) ролик просто идёт всегда:
    // теряется только экономия на прокрученном мимо макете.
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

  /**
   * Курсор целится по фактическому положению кнопки, а не по процентам от
   * экрана: кнопки лежат в потоке карточки, и зашитые координаты разъехались
   * бы при первой же правке её вёрстки.
   */
  const aim = useCallback(() => {
    const screen = screenRef.current;
    const target = cursorTarget(tour, DECK_STEPS, panel);
    const button = screen?.querySelector(`[data-deck-action="${target}"]`);
    if (!screen || !button) return;
    const from = screen.getBoundingClientRect();
    const to = button.getBoundingClientRect();
    setCursor({
      x: to.left - from.left + to.width / 2,
      y: to.top - from.top + to.height / 2,
    });
  }, [panel, tour]);

  useLayoutEffect(() => {
    if (!running) return;
    aim();
  }, [aim, running]);

  useEffect(() => {
    if (!running) return;
    window.addEventListener("resize", aim);
    return () => window.removeEventListener("resize", aim);
  }, [aim, running]);

  /**
   * Один таймер на всё: он же двигает фазу, он же листает колоду. Отдельный
   * эффект «увидел фазу — листай» разъезжался бы с рассказом при первом же
   * лишнем рендере, а карточка уходит ровно раз за шаг — на входе в показ
   * ответа.
   */
  useEffect(() => {
    if (!running || paused) return;
    const timer = setTimeout(() => {
      const next = nextDeckState(tour, DECK_STEPS);
      if (shouldAdvanceCard(next.phase) && step.move !== "none") {
        advance(step.move);
      }
      setTour(next);
    }, durationFor(tour, DECK_STEPS));
    return () => clearTimeout(timer);
  }, [advance, paused, running, step.move, tour]);

  // Колода могла смениться (данные приехали) — индекс из прошлой длиннее.
  const safeIndex = currentIndex % deck.length;
  const currentProfile = deck[safeIndex];
  const nextProfile = deck[(safeIndex + 1) % deck.length];

  return (
    <div className={cn("relative", className)}>
      {/* Phone frame */}
      <div className="relative mx-auto w-[300px] md:w-[320px]">
        {/* Phone body */}
        <div className="relative bg-bg-2 rounded-[40px] p-2 shadow-2xl shadow-black/50">
          {/* Notch */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 w-32 h-7 bg-bg-0 rounded-full z-20" />
          
          {/* Screen */}
          <div ref={screenRef} className="relative bg-bg-0 rounded-[32px] overflow-hidden">
            {/* Status bar */}
            <div className="flex items-center justify-between px-6 py-3 bg-bg-1/50">
              <span className="text-text-0 text-xs font-mono">9:41</span>
              <div className="flex items-center gap-1">
                <div className="flex gap-0.5">
                  <div className="w-1 h-2 bg-text-0 rounded-sm" />
                  <div className="w-1 h-3 bg-text-0 rounded-sm" />
                  <div className="w-1 h-4 bg-text-0 rounded-sm" />
                  <div className="w-1 h-3 bg-text-1 rounded-sm" />
                </div>
                <svg width="16" height="12" viewBox="0 0 16 12" className="ml-1">
                  <path 
                    d="M8 2.5C10.5 2.5 12.7 3.6 14.2 5.3L15.5 4C13.6 1.8 10.9 0.5 8 0.5C5.1 0.5 2.4 1.8 0.5 4L1.8 5.3C3.3 3.6 5.5 2.5 8 2.5ZM8 4.5C6.3 4.5 5 5.8 5 7.5C5 9.2 6.3 10.5 8 10.5C9.7 10.5 11 9.2 11 7.5C11 5.8 9.7 4.5 8 4.5ZM8 9.5C6.1 9.5 4.5 8.4 4.5 7C4.5 5.6 6.1 4.5 8 4.5C9.9 4.5 11.5 5.6 11.5 7C11.5 8.4 9.9 9.5 8 9.5Z" 
                    fill="currentColor"
                    className="text-text-0"
                  />
                </svg>
              </div>
            </div>

            {/* App header */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <VedaMatchMark className="h-9 w-9" />
                <span className="font-display text-sm font-bold text-text-0">VedaMatch</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-glass flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-text-1">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Card stack */}
            <div className="relative h-[420px] mx-3 mb-3">
              {/* Next card (behind) */}
              <div className="absolute inset-0 scale-[0.95] translate-y-2 rounded-3xl overflow-hidden opacity-50">
                {/* Подписанные ссылки витрины приходят с разных хостов
                    хранилища — см. комментарий в SwipeCard. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={nextProfile.imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>

              {/* Current card */}
              <div className="relative w-full h-full">
                <SwipeCard
                  {...currentProfile}
                  onSwipeLeft={handleSwipe}
                  onSwipeRight={handleSwipe}
                  onLike={handleSwipe}
                  onUndo={handleUndo}
                  breakdown={currentProfile.breakdown}
                  breakdownOpen={breakdownOpen}
                  onToggleBreakdown={() => toggle("breakdown")}
                  astroMenuOpen={astroMenuOpen}
                  onAstro={() => toggle("astroMenu")}
                  astroOpen={astroOpen}
                  astroPurpose={astroPurpose}
                  onPickPurpose={(purpose) => {
                    setAstroPurpose(purpose);
                    setOverride({ at: tour.index, panel: "astro" });
                  }}
                  onCloseAstro={() =>
                    setOverride({ at: tour.index, panel: null })
                  }
                />
              </div>
            </div>

            {/* Bottom tab indicator */}
            <div className="flex justify-center gap-2 pb-4">
              {deck.map((card, idx) => (
                <div
                  key={card.id}
                  className={cn(
                    "w-2 h-2 rounded-full transition-all duration-300",
                    idx === safeIndex
                      ? "bg-magenta w-4"
                      : "bg-text-2"
                  )}
                />
              ))}
            </div>

            {/* Ответ сервиса — те же слова, что показывает колода в кабинете */}
            {reply && (
              <div className="pointer-events-none absolute inset-x-0 top-24 z-30 flex justify-center">
                <span className="preview-screen-in rounded-full border border-mint-edge bg-mint px-3.5 py-1.5 text-xs font-semibold text-on-mint shadow-lg">
                  {reply}
                </span>
              </div>
            )}

            {running && cursor && (
              <div
                className="pointer-events-none absolute left-0 top-0 z-40 transition-transform ease-in-out"
                style={{
                  transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)`,
                  transitionDuration: `${cursorTravelFor(tour.phase)}ms`,
                }}
              >
                <TourFinger pressing={pressing} />
              </div>
            )}
          </div>
        </div>

        {/*
          Рассказ идёт под телефоном, а не поверх экрана: подпись на экране
          закрывала бы ту самую карточку, ради которой сюда и смотрят.
          Высота держится постоянной — иначе страница дёргалась бы на каждой
          реплике разной длины.
        */}
        {running && (
          <p
            key={tour.index}
            className="preview-screen-in mx-auto mt-5 flex min-h-[3.5rem] max-w-[19rem] items-start justify-center text-center text-sm leading-snug text-text-1"
          >
            {step.caption}
          </p>
        )}
      </div>

      {/* Glow effect */}
      <div className="absolute -inset-4 bg-gradient-to-r from-magenta/20 via-cyan/20 to-gold/20 blur-xl -z-10 opacity-50" />
    </div>
  );
}
