"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HOLD_TICK_MS, HOLD_THRESHOLD_MS, holdSeekStep } from "./hold-seek";

/**
 * Кнопка перехода по записям, которая под удержанием мотает звук.
 *
 * Возвращает готовые обработчики: разбор жеста одинаков для «назад» и
 * «вперёд», и списывать его дважды значит однажды разойтись в порогах.
 *
 * Переключение висит на `click`, а не на `pointerup`: с клавиатуры и от
 * скринридера приходит только `click`, и кнопка, слушающая указатель,
 * молчала бы на Enter. Удержание же гасит следующий за ним `click` флагом —
 * отпустить палец после перемотки и получить вдобавок смену записи было бы
 * ровно тем, чего человек не просил.
 */
export function useHoldSeek({
  direction,
  seekBy,
  onTap,
  disabled = false,
}: {
  /** `-1` — назад, `1` — вперёд. */
  direction: -1 | 1;
  /** Сдвинуть звук на столько секунд. */
  seekBy: (seconds: number) => void;
  /** Короткое нажатие: перейти к соседней записи. */
  onTap: () => void;
  /**
   * Соседней записи нет. Мотать при этом можно: перемотка относится к
   * играющему, а не к очереди, и запирать её вместе с переходом незачем.
   */
  disabled?: boolean;
}) {
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Успело ли нажатие стать перемоткой — по нему `click` решает, молчать ли. */
  const sought = useRef(false);
  const tick = useRef(0);
  /** Только для вида: кнопка под перемоткой подсвечивается. */
  const [seeking, setSeeking] = useState(false);

  const stop = useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (tickTimer.current) clearInterval(tickTimer.current);
    holdTimer.current = null;
    tickTimer.current = null;
    setSeeking(false);
  }, []);

  // Таймеры переживают размонтирование полосы (переход между сервисами,
  // закрытие плеера) и продолжили бы дёргать звук в пустоту.
  useEffect(() => stop, [stop]);

  const begin = useCallback(() => {
    sought.current = false;
    tick.current = 0;
    stop();
    holdTimer.current = setTimeout(() => {
      sought.current = true;
      setSeeking(true);
      // Первый шаг сразу, не дожидаясь тика: иначе между порогом и первым
      // движением звука проходит ещё интервал, и жест кажется незамеченным.
      seekBy(direction * holdSeekStep(tick.current++));
      tickTimer.current = setInterval(() => {
        seekBy(direction * holdSeekStep(tick.current++));
      }, HOLD_TICK_MS);
    }, HOLD_THRESHOLD_MS);
  }, [direction, seekBy, stop]);

  return {
    seeking,
    /** Разложить в `<button>`. */
    props: {
      onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
        // Правая и средняя кнопки мыши жестом не считаются.
        if (event.button !== 0) return;
        begin();
      },
      onPointerUp: stop,
      onPointerCancel: stop,
      onPointerLeave: stop,
      // Долгое нажатие на телефоне зовёт меню выделения — оно перекрывает
      // полосу ровно в тот момент, когда человек мотает.
      onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
      },
      onClick: () => {
        if (sought.current) {
          sought.current = false;
          return;
        }
        if (!disabled) onTap();
      },
    },
  };
}
