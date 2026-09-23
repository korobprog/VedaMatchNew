"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Сколько держать заслон после того, как палец поднят. Столько браузер
 * может ещё дослать хвост жеста — `pointerup`, `click` по месту, где палец
 * оторвался. 350 мс хватает с запасом и незаметно человеку: следующий тап
 * раньше него не успевает.
 */
export const TOUCH_SHIELD_TAIL_MS = 350;

/** Потолок на случай, если конец касания так и не пришёл. */
export const TOUCH_SHIELD_MAX_MS = 2000;

/**
 * Заслон на время жеста, которым закрыли окно (VED-408).
 *
 * Боковое меню закрывается мазком, и закрывается ПОСЕРЕДИНЕ мазка: как
 * только жест засчитан. Панель и её подложка исчезают, а палец ещё на
 * стекле — и остаток касания доставался странице под ним: браузер снимает
 * захват указателя с удалённого элемента и шлёт `pointerup` и `click` туда,
 * где палец оказался. У заказчика «нажимались активные зоны страницы».
 *
 * Пока заслон поднят, над страницей лежит прозрачный слой (его рисует
 * вызывающий), и хвост жеста уходит в него. Опускается заслон через
 * `TOUCH_SHIELD_TAIL_MS` после отрыва пальца.
 *
 * Возвращает `[поднят ли, поднять]`.
 */
export function useTouchShield(): [boolean, () => void] {
  const [raised, setRaised] = useState(false);

  useEffect(() => {
    if (!raised) return;
    let tail: number | undefined;
    const lower = () => setRaised(false);
    const release = () => {
      window.clearTimeout(tail);
      tail = window.setTimeout(lower, TOUCH_SHIELD_TAIL_MS);
    };
    const ceiling = window.setTimeout(lower, TOUCH_SHIELD_MAX_MS);
    /* И касания, и указатели: `touchend` не всплывает до окна, если элемент,
       на котором палец начал, уже удалён, а `pointerup` после снятия
       захвата приходит туда, где палец сейчас, то есть в заслон. */
    const events = ["touchend", "touchcancel", "pointerup", "pointercancel"];
    for (const name of events)
      window.addEventListener(name, release, { passive: true, capture: true });
    return () => {
      window.clearTimeout(tail);
      window.clearTimeout(ceiling);
      for (const name of events)
        window.removeEventListener(name, release, { capture: true });
    };
  }, [raised]);

  const raise = useCallback(() => setRaised(true), []);
  return [raised, raise];
}
