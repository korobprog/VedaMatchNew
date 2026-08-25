"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { burstRays, TOAST_MS } from "./deck-burst";

/**
 * Подсказка после решения — накладкой по центру колоды, а не строкой под ней.
 *
 * Строка в потоке раздвигала страницу: на телефоне экран подпрыгивал ровно
 * тогда, когда рука шла к следующей анкете. Накладка ничего не двигает,
 * `pointer-events-none` пропускает касания к кнопкам под собой, а салют
 * отмечает взаимность — то единственное, ради чего сюда и заходят.
 */
export function DeckToast({
  message,
  celebrate,
  onDone,
}: {
  message: string | null;
  /** Салют — только для взаимности; «запрос отправлен» это просто факт. */
  celebrate: boolean;
  onDone: () => void;
}) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDone, TOAST_MS);
    return () => clearTimeout(timer);
  }, [message, onDone]);

  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
      <AnimatePresence>
        {message && (
          <motion.div
            key={message}
            initial={
              reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.86 }
            }
            animate={{ opacity: 1, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
            transition={
              reduceMotion
                ? { duration: 0.15 }
                : { type: "spring", stiffness: 320, damping: 22 }
            }
            className="relative"
          >
            {celebrate && !reduceMotion && <Burst />}
            <p
              role="status"
              className="relative rounded-2xl border border-glass-brd bg-sheet px-5 py-3 text-center font-display text-base font-bold text-text-0 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl"
            >
              {message}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Цвета салюта — портальные акценты, а не праздничная палитра со стороны. */
const rayColors = [
  "var(--vm-magenta)",
  "var(--vm-gold)",
  "var(--vm-cyan)",
  "var(--vm-like)",
];

function Burst() {
  const rays = burstRays(14, 132);

  return (
    <span
      aria-hidden="true"
      className="absolute left-1/2 top-1/2 h-0 w-0"
    >
      {rays.map((ray, i) => (
        <motion.span
          key={i}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
          animate={{
            x: ray.dx,
            y: ray.dy,
            opacity: [0, 1, 1, 0],
            scale: [0.4, 1, 1, 0.6],
          }}
          transition={{
            duration: 0.9,
            delay: ray.delay,
            times: [0, 0.2, 0.65, 1],
            ease: "easeOut",
          }}
          className="absolute h-2 w-2 rounded-full"
          style={{ backgroundColor: rayColors[i % rayColors.length] }}
        />
      ))}
    </span>
  );
}
