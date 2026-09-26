"use client";

import { useCallback, useEffect, useState } from "react";
import { eqFits } from "./eq-fit";

/**
 * Хватает ли в ряду полосы места эквалайзеру (VED-450, круг 5): ряд и
 * вынесенные кнопки меряются на ходу, решение — `eqFits`.
 *
 * Кнопки меряются по одной, а не их обёрткой: без эквалайзера обёртка
 * растягивается на весь ряд, чтобы раздать кнопкам равные зазоры, и её
 * ширина уже ничего не говорит о кнопках.
 *
 * Рефы — колбэки: ряд появляется и пропадает вместе с полосой, и эффект
 * должен подписаться заново на новый элемент. `layout` — набор вынесенных
 * кнопок: растянутая обёртка от снятой кнопки не меняет размер, и без
 * этого ключа наблюдатель смену набора не заметил бы.
 */
export function useEqualizerRoom(
  margins: number,
  initial: boolean,
  layout: string,
) {
  const [row, setRow] = useState<HTMLElement | null>(null);
  const [buttons, setButtons] = useState<HTMLElement | null>(null);
  const [room, setRoom] = useState(initial);

  useEffect(() => {
    if (!row || !buttons) return;
    const measure = () => {
      let width = 0;
      buttons.querySelectorAll("button").forEach((button) => {
        width += button.offsetWidth;
      });
      setRoom(eqFits(row.clientWidth, width, margins));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    observer.observe(buttons);
    return () => observer.disconnect();
  }, [row, buttons, margins, layout]);

  return {
    room,
    attachRow: useCallback((node: HTMLElement | null) => setRow(node), []),
    attachButtons: useCallback((node: HTMLElement | null) => setButtons(node), []),
  };
}
