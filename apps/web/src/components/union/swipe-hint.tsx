"use client";

import { useSyncExternalStore } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  getSwipeHintServerSnapshot,
  getSwipeHintSnapshot,
  rememberSwipeHintSeen,
  subscribeSwipeHint,
} from "@/lib/union/swipe-hint-seen";

/**
 * Один проход жеста: рука идёт влево, возвращается, идёт вправо, возвращается.
 * `times` держит стрелки в такт руке — подсвечивается та сторона, куда рука
 * едет сейчас, иначе рисунок читается как «двигай в обе стороны разом».
 */
const gestureTimes = [0, 0.28, 0.5, 0.78, 1];
const gestureLoop = {
  duration: 2.8,
  times: gestureTimes,
  repeat: Infinity,
  repeatDelay: 0.4,
  ease: "easeInOut",
} as const;

/**
 * Жест свайпа рисунком, а не словами: рука с вытянутым пальцем и стрелки в
 * обе стороны. Иконка на `currentColor` и без внешнего файла — цвет берёт от
 * темы, а лишнего запроса за картинкой в момент первого показа не будет.
 *
 * Рука качается сама: неподвижный рисунок объясняет, что жест есть, но не
 * показывает его — а показать движение движением дешевле, чем описать.
 */
function SwipeGestureIcon({ animate }: { animate: boolean }) {
  return (
    <svg
      viewBox="0 0 220 150"
      className="h-32 w-auto text-white"
      fill="currentColor"
      aria-hidden="true"
    >
      {/* Стрелки влево и вправо на уровне кончика пальца. */}
      <motion.path
        d="M84 24H36v-9L10 28.5 36 42v-9h48z"
        animate={animate ? { opacity: [0.3, 1, 0.3, 0.3, 0.3] } : undefined}
        transition={gestureLoop}
      />
      <motion.path
        d="M136 24h48v-9l26 13.5L184 42v-9h-48z"
        animate={animate ? { opacity: [0.3, 0.3, 0.3, 1, 0.3] } : undefined}
        transition={gestureLoop}
      />

      <motion.g
        animate={animate ? { x: [0, -30, 0, 30, 0] } : undefined}
        transition={gestureLoop}
      >
        {/* Кольцо касания вокруг кончика пальца. */}
        <motion.path
          d="M110 6c-9.4 0-17 7.6-17 17s7.6 17 17 17 17-7.6 17-17-7.6-17-17-17zm0 8c5 0 9 4 9 9s-4 9-9 9-9-4-9-9 4-9 9-9z"
          animate={animate ? { opacity: [0.45, 1, 0.45, 1, 0.45] } : undefined}
          transition={gestureLoop}
        />

        {/* Ладонь: указательный палец от кольца вниз, остальные — сжаты. */}
        <path d="M104 34v46l-14-16c-4-4-10-4-14 0-4 4-4 10 0 14l24 32c5 7 13 11 22 11h20c15 0 27-12 27-27V62c0-5-4-9-9-9s-9 4-9 9v-4c0-5-4-9-9-9s-9 4-9 9v-4c0-5-4-9-9-9s-9 4-9 9V34c0-5-4-9-9-9s-9 4-9 9z" />
      </motion.g>
    </svg>
  );
}

/**
 * Подсказка о жесте при первом заходе в колоду. Закрывается тапом в любом
 * месте — отдельная кнопка тут была бы лишним шагом: подсказка и учит тому,
 * что экран отзывается на прикосновение.
 */
export function SwipeHint() {
  const seen = useSyncExternalStore(
    subscribeSwipeHint,
    getSwipeHintSnapshot,
    getSwipeHintServerSnapshot,
  );
  const reduceMotion = useReducedMotion();

  if (seen) return null;

  return (
    <div
      role="dialog"
      aria-label="Как листать анкеты"
      onClick={() => rememberSwipeHintSeen(window.localStorage)}
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 rounded-3xl bg-black/85 p-6 text-center"
    >
      <SwipeGestureIcon animate={!reduceMotion} />
      <div className="space-y-1">
        <p className="font-display text-lg font-bold text-white">
          Листайте анкеты пальцем
        </p>
        <p className="text-sm text-white/80">
          Влево — пропустить, вправо — познакомиться, вверх — суперлайк. То же
          самое делают кнопки внизу.
        </p>
      </div>
      <button
        type="button"
        onClick={() => rememberSwipeHintSeen(window.localStorage)}
        className="rounded-2xl bg-gradient-to-r from-magenta to-[#B23EFF] px-6 py-2.5 text-sm font-semibold text-white"
      >
        Понятно
      </button>
    </div>
  );
}
