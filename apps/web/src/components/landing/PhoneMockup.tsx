"use client";

import { useCallback, useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import type { UnionShowcaseCard } from "@vedamatch/shared";
import { VedaMatchMark } from "@/components/icons/vedamatch-mark";
import { SwipeCard } from "./SwipeCard";
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
  tags: string[];
}

/** Пауза между автоматическими перелистываниями карточек витрины. */
const AUTOPLAY_INTERVAL_MS = 5000;

/** Запасная колода: показывается, пока никто не согласился на витрину. */
const demoProfiles: DeckCard[] = [
  {
    id: "demo-1",
    name: "Александра",
    age: 28,
    location: "Москва, Россия",
    description: "Йогиня с 8-летним опытом. Люблю медитацию на рассвете и киртаны по вечерам. Ищу единомышленников для совместной практики и служения.",
    imageUrl: "/landing/profiles/alexandra.jpg",
    compatibility: 94,
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

  const deck: DeckCard[] =
    cards && cards.length > 0
      ? cards.map((card) => ({
          id: card.id,
          name: card.name,
          age: card.age,
          location: toLocationLine(card),
          description: card.about,
          imageUrl: card.photoUrl,
          tags: card.interests,
        }))
      : demoProfiles;

  const advance = useCallback(() => {
    setIsAnimating(true);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % deck.length);
      setIsAnimating(false);
    }, 300);
  }, [deck.length]);

  const handleSwipe = () => {
    if (isAnimating) return;
    advance();
  };

  // Витрина листается сама: гость видит несколько анкет, ничего не нажимая.
  // Зависимость от currentIndex перезапускает отсчёт после ручного свайпа —
  // иначе следующая карточка успевала бы уехать сразу после его собственной.
  // prefers-reduced-motion отключает автолистание: движение здесь
  // декоративное, и остаётся ручное управление кнопками карточки.
  useEffect(() => {
    if (reduceMotion) return;
    const timer = window.setInterval(advance, AUTOPLAY_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [advance, currentIndex, reduceMotion]);

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
          <div className="relative bg-bg-0 rounded-[32px] overflow-hidden">
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
          </div>
        </div>
      </div>

      {/* Glow effect */}
      <div className="absolute -inset-4 bg-gradient-to-r from-magenta/20 via-cyan/20 to-gold/20 blur-xl -z-10 opacity-50" />
    </div>
  );
}
