"use client";

import { useEffect, useSyncExternalStore } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  getPhotoHintServerSnapshot,
  getPhotoHintSnapshot,
  rememberPhotoHintSeen,
  subscribePhotoHint,
} from "@/lib/union/photo-hint-seen";

/** Сколько подсказка живёт на экране, мс. */
const HINT_MS = 3600;

/**
 * «Тапните по краю фото» — один раз на телефон.
 *
 * Показывает половины подсветкой, а не кружками со стрелками: у самых краёв
 * карточки уже стоят стрелки листания анкет, и ещё одна пара шевронов рядом
 * читалась бы как кнопка — человек тянулся бы к ней, а попадал в соседнюю.
 * Подсветка ни на что не похожа, кроме области, по которой надо тапнуть.
 *
 * Не перекрывает карточку затемнением, как подсказка о свайпе: та учит
 * жесту, ради которого сюда и зашли. Эта — про мелочь, и загораживать ради
 * неё анкету незачем. `pointer-events-none` пропускает касания насквозь:
 * подсказку не надо закрывать, достаточно сделать то, о чём она говорит.
 */
export function PhotoTapHint() {
  const seen = useSyncExternalStore(
    subscribePhotoHint,
    getPhotoHintSnapshot,
    getPhotoHintServerSnapshot,
  );
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (seen) return;
    const timer = setTimeout(
      () => rememberPhotoHintSeen(window.localStorage),
      HINT_MS,
    );
    return () => clearTimeout(timer);
  }, [seen]);

  if (seen) return null;

  const pulse = reduceMotion
    ? { opacity: 0.5 }
    : { opacity: [0.15, 0.55, 0.15], transition: { duration: 1.6, repeat: 2 } };

  return (
    <div
      data-testid="photo-tap-hint"
      className="pointer-events-none absolute inset-0 z-10"
    >
      {/* Половины, по которым и надо тапать: свет от края к середине. */}
      <motion.span
        aria-hidden="true"
        animate={pulse}
        className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-white/70 to-transparent"
      />
      <motion.span
        aria-hidden="true"
        animate={pulse}
        className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-white/70 to-transparent"
      />

      {/*
        Подпись выше середины: по центру карточки её перекрыла бы кнопка
        сворачивания раскрытой анкеты, а `role="status"` вместо заголовка —
        чтобы справка о жесте не вставала в порядок h1→h2→h3.
      */}
      <p
        role="status"
        className="absolute inset-x-0 top-1/3 mx-auto w-fit rounded-full bg-black/65 px-3 py-1.5 text-center text-xs font-medium text-white backdrop-blur-sm"
      >
        Тапните по краю фото
      </p>
    </div>
  );
}
