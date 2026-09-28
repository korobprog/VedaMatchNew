"use client";

import { useEffect, useState } from "react";
import { REMAINING_FLASH_MS, remainingAfter } from "./remaining-count";

/**
 * Число «сколько осталось» в правом верхнем углу ленты, под ☰ (VED-640).
 * Появляется при перелистывании на новый пост и через секунду гаснет.
 *
 * Визуальная подсказка, а не сообщение: `aria-hidden`, без `aria-live` —
 * объявлять число на каждом свайпе значило бы перебивать чтение цитаты.
 * Позицию в ленте скринридер и так узнаёт из `aria-posinset`/`aria-setsize`.
 * При `prefers-reduced-motion` число появляется и исчезает без растворения.
 *
 * Подложка — чёрная 60 %: поверх самого светлого кадра белый текст на ней
 * даёт ≈5.7:1, выше порога 4.5:1 для мелкого текста.
 */
export function RemainingBadge({
  total,
  index,
  hidden = false,
  placement = "right-3 top-14",
}: {
  total: number | undefined;
  index: number;
  /** На служебном слайде (разделитель, финал) считать нечего. */
  hidden?: boolean;
  /**
   * Где стоит число. По умолчанию — под ☰; в «Видео» под ☰ строка папок, и
   * число встаёт ниже неё.
   */
  placement?: string;
}) {
  // Какой пост последним вызвал вспышку; `null` — число погасло.
  const [flashFor, setFlashFor] = useState<number | null>(null);
  const [seenIndex, setSeenIndex] = useState(index);
  // Смена поста — вспышка. Считаем при рендере, а не эффектом: так число
  // появляется в том же кадре, что и новый пост.
  if (index !== seenIndex) {
    setSeenIndex(index);
    setFlashFor(index);
  }

  useEffect(() => {
    if (flashFor === null) return;
    const timer = setTimeout(() => setFlashFor(null), REMAINING_FLASH_MS);
    return () => clearTimeout(timer);
  }, [flashFor]);

  const remaining = remainingAfter(total, index);
  if (remaining === null) return null;
  const visible = !hidden && flashFor === index;

  return (
    <div
      aria-hidden="true"
      data-testid="remaining-badge"
      data-visible={visible ? "true" : "false"}
      className={`pointer-events-none absolute ${placement} z-30 min-w-8 rounded-full bg-black/60 px-2.5 py-0.5 text-center font-mono text-sm font-semibold text-white transition-opacity duration-300 motion-reduce:transition-none ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      {remaining}
    </div>
  );
}
