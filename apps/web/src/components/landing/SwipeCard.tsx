"use client";

import { useRef, useState } from "react";
import { motion, useMotionValue, useTransform, PanInfo } from "framer-motion";
import type { AstroCompatibilityPurpose } from "@vedamatch/shared";
import { DeckAstroMenu } from "./deck-astro-menu";
import { DeckAstroPanel } from "./deck-astro-panel";
import { StarsIcon } from "./deck-controls";
import {
  COMPATIBILITY_CRITERIA,
  CompatibilityBreakdown,
  CompatibilityRing,
  DECK_BUTTON,
  FlameIcon,
  HeartIcon,
  type BreakdownRow,
} from "./deck-controls";

interface SwipeCardProps {
  name: string;
  /** null — возраст закрыт приватностью; подпись тогда одно имя. */
  age?: number | null;
  /** null — город закрыт приватностью; строка под именем не рисуется. */
  location?: string | null;
  description?: string | null;
  imageUrl: string;
  compatibility?: number;
  tags?: string[];
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onLike?: () => void;
  /** Возврат предыдущей анкеты — кнопка «↺», как в колоде сервиса. */
  onUndo?: () => void;
  /**
   * Разбор совместимости открыт. Состояние снаружи: им управляет и нажатие
   * на кольцо, и ролик витрины, который это нажатие показывает.
   */
  breakdownOpen?: boolean;
  onToggleBreakdown?: () => void;
  /** Строки разбора: с оценками у демо-анкет, с одними весами — у витрины. */
  breakdown?: BreakdownRow[];
  /** Открыть или закрыть меню целей сверки карт. */
  onAstro?: () => void;
  /** Меню целей раскрыто. */
  astroMenuOpen?: boolean;
  /** Выбрана цель — показываем сверку по ней. */
  onPickPurpose?: (purpose: AstroCompatibilityPurpose) => void;
  onCloseAstro?: () => void;
  astroOpen?: boolean;
  astroPurpose?: AstroCompatibilityPurpose;
}

export function SwipeCard({
  name,
  age = null,
  location = null,
  description = null,
  imageUrl,
  compatibility = 0,
  tags = [],
  onSwipeLeft,
  onSwipeRight,
  onLike,
  onUndo,
  breakdownOpen = false,
  onToggleBreakdown,
  breakdown,
  onAstro,
  astroMenuOpen = false,
  onPickPurpose,
  onCloseAstro,
  astroOpen = false,
  astroPurpose = "family",
}: SwipeCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const constraintsRef = useRef(null);
  
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-20, 20]);
  const opacityX = useTransform(x, [-200, 0, 200], [0.5, 1, 0.5]);
  
  const nopeOpacity = useTransform(x, [-100, 0], [1, 0]);
  const likeOpacity = useTransform(x, [0, 100], [0, 1]);
  const starOpacity = useTransform(x, [-50, 0, 50], [0, 0, 0]);

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setIsDragging(false);
    const threshold = 100;
    
    if (info.offset.x > threshold) {
      onSwipeRight?.();
    } else if (info.offset.x < -threshold) {
      onSwipeLeft?.();
    }
  };

  return (
    <div
      className="relative w-full h-full rounded-3xl overflow-hidden bg-glass border border-glass-brd"
    >
      {/* Draggable wrapper */}
      <motion.div
        ref={constraintsRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        drag={!isDragging}
        dragConstraints={{ left: -200, right: 200, top: -200, bottom: 200 }}
        dragElastic={0.7}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={handleDragEnd}
        style={{ x, rotate, opacity: opacityX }}
        whileTap={{ cursor: "grabbing" }}
      >
        {/* Image */}
        <div className="relative w-full h-[65%]">
          {/* Ссылки витрины подписаны и приходят с разных хостов хранилища —
              перечислить их в remotePatterns нельзя, поэтому обычный img,
              как и в карусели анкеты. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={name}
            className="absolute inset-0 h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
          
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-bg-0 via-transparent to-transparent" />
          
          {/* Swipe indicators */}
          <motion.div
            style={{ opacity: likeOpacity }}
            className="absolute top-6 right-6 px-4 py-2 rounded-xl bg-green-500/90 backdrop-blur-sm border-2 border-green-400"
          >
            <span className="text-white font-bold text-lg">LIKE</span>
          </motion.div>
          
          <motion.div
            style={{ opacity: nopeOpacity }}
            className="absolute top-6 left-6 px-4 py-2 rounded-xl bg-red-500/90 backdrop-blur-sm border-2 border-red-400"
          >
            <span className="text-white font-bold text-lg">NOPE</span>
          </motion.div>

          <motion.div
            style={{ opacity: starOpacity }}
            className="absolute top-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-cyan-500/90 backdrop-blur-sm border-2 border-cyan-400"
          >
            <span className="text-white font-bold text-lg">SUPER LIKE</span>
          </motion.div>
        </div>

        {/* Info section — its own scrim keeps the text legible in both themes */}
        {/* Нижний отступ держит текст над панелью решений: она лежит поверх
            карточки и без него накрывала бы интересы. */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-bg-0 via-bg-0/90 to-transparent p-5 pt-10 pb-[4.5rem]">
          <div className="mb-2">
            <h3 className="font-display text-xl font-bold text-text-0">
              {age === null ? name : `${name}, ${age}`}
            </h3>
            {location && <p className="text-text-1 text-sm">{location}</p>}
          </div>

          {description && (
            <p className="text-text-1 text-sm mb-3 line-clamp-2">{description}</p>
          )}
          
          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.slice(0, 3).map((tag) => (
                <span 
                  key={tag}
                  className="px-2 py-1 rounded-full bg-glass text-text-1 text-xs font-medium"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {/*
        Панель решений — та же, что в колоде Знакомств: пропустить, вернуть
        анкету, кольцо совместимости, суперлайк и знакомство. Раскладка тоже
        её: `justify-between` во всю ширину карточки, а не кучка по центру.

        `data-deck-action` — метка для ролика витрины: курсор ищет кнопку по
        ней, а не по aria-label, чтобы правка подписи для скринридера не
        уводила курсор в пустоту.
      */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between gap-1.5 px-3 pb-3 pt-6">
        <motion.button
          data-deck-action="pass"
          whileTap={{ scale: 0.9 }}
          onClick={() => onSwipeLeft?.()}
          className={`${DECK_BUTTON} h-12 w-12 text-xl text-white`}
          aria-label="Пропустить"
        >
          ✕
        </motion.button>

        <motion.button
          data-deck-action="undo"
          whileTap={{ scale: 0.9 }}
          onClick={() => onUndo?.()}
          className={`${DECK_BUTTON} h-11 w-11 text-lg text-white`}
          aria-label="Вернуть предыдущую анкету"
        >
          ↺
        </motion.button>

        {/* Кольцо стоит всегда — оно центр панели и в сервисе. Процент
            считается относительно смотрящего, поэтому у анкет витрины его
            нет: кольцо тогда пустое, а разбор показывает веса критериев. */}
        <CompatibilityRing
          total={compatibility > 0 ? compatibility : null}
          size={56}
          expanded={breakdownOpen}
          onClick={() => onToggleBreakdown?.()}
        />

        <motion.button
          data-deck-action="superlike"
          whileTap={{ scale: 0.9 }}
          onClick={() => onLike?.()}
          // Огонь золотой: суперлайк — не то же, что обычный интерес, и в
          // ряду одинаково белых кнопок это терялось.
          className={`${DECK_BUTTON} h-12 w-12 text-gold drop-shadow-[0_0_10px_var(--vm-glow-gold)]`}
          aria-label="Суперлайк"
        >
          <FlameIcon />
        </motion.button>

        <motion.button
          data-deck-action="like"
          whileTap={{ scale: 0.9 }}
          onClick={() => onSwipeRight?.()}
          // Выделяется само решение — зелёное сердце со свечением, а не
          // заливка кнопки: корпус у неё общий с соседями.
          className={`${DECK_BUTTON} h-12 w-12 text-like drop-shadow-[0_0_10px_var(--vm-glow-like)]`}
          aria-label="Познакомиться"
        >
          <HeartIcon />
        </motion.button>
      </div>

      {/* Сверка карт по звёздам — соседний сервис, и попасть в него можно
          прямо отсюда. Кнопкой в углу, а не строкой под тегами: там ссылка
          налезала на интересы. */}
      <button
        type="button"
        data-deck-action="astro"
        onClick={() => onAstro?.()}
        aria-label="Проверить совместимость по звёздам"
        className={`${DECK_BUTTON} absolute right-3 top-3 z-20 h-9 w-9 text-gold`}
      >
        <StarsIcon />
      </button>

      {astroMenuOpen && (
        <DeckAstroMenu
          onPick={(purpose) => onPickPurpose?.(purpose)}
          onClose={() => onAstro?.()}
        />
      )}

      {astroOpen && (
        <DeckAstroPanel
          purpose={astroPurpose}
          onClose={() => onCloseAstro?.()}
        />
      )}

      {breakdownOpen && (
        <CompatibilityBreakdown
          total={compatibility > 0 ? compatibility : null}
          // Без разбора анкеты остаются одни веса — они про алгоритм, а не
          // про человека, и правдивы для любой карточки.
          rows={
            breakdown ??
            COMPATIBILITY_CRITERIA.map((row) => ({ ...row, score: null }))
          }
          onClose={() => onToggleBreakdown?.()}
        />
      )}
    </div>
  );
}
