"use client";

/**
 * Столбики «идёт воспроизведение» — тот же значок, которым макеты ленты
 * друзей отмечают «слушает», только живой.
 *
 * Это украшение, а не эквалайзер: звук здесь не анализируется. Настоящий
 * эквалайзер план сервиса отвергает прямо — он требует Web Audio-графа на
 * весь поток и ломает Media Session. Столбики говорят ровно одно: «играет»,
 * и стоят ноль процессора.
 *
 * Для скринридера значок невидим: состояние воспроизведения уже сказано
 * кнопкой пуска, и второй голос об одном и том же только мешает.
 */

import { useEffect, useRef, useState } from "react";
import { EQ_BAR_GAP, EQ_BAR_WIDTH, eqBarCount } from "./eq-fit";

/**
 * Узоры высот, темпов и смещений.
 *
 * Три разной длины и взаимно простые (7, 5, 4): перебирая их по кругу, ни
 * один столбик не повторяет соседа целиком, и полоса не распадается на
 * заметный повтор. С одинаковыми значениями столбики ходят строем, и это
 * читается как заставка «загрузка», а не как звучащая музыка.
 *
 * Значения заданы списком, а не случайные: компонент рисуется и на сервере,
 * и в браузере, и `Math.random()` дал бы разные высоты в двух рендерах —
 * то есть расхождение гидратации на ровном месте.
 */
const HEIGHTS = [7, 13, 9, 16, 8, 12, 10];
const DURATIONS = [780, 1080, 900, 1240, 840];
const DELAYS = [0, 160, 320, 80];

/**
 * Сколько столбиков рисуем. Ширину полоса занимает всю свободную, поэтому
 * число подобрано под самый узкий телефон: на 320 точках они ещё не
 * слипаются, на широком — просто становятся реже.
 */
const BAR_COUNT = 14;

export function MusicPlayingBars({
  playing,
  fill = false,
  className = "",
}: {
  playing: boolean;
  /**
   * Во всю ширину с постоянным шагом (VED-450, круг 5): столбиков столько,
   * сколько встаёт, а не 14 раздвинутых. До замера — ни одного: число
   * столбиков известно только в браузере.
   */
  fill?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [fitted, setFitted] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!fill || !node) return;
    const measure = () => setFitted(eqBarCount(node.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [fill]);
  const count = fill ? fitted : BAR_COUNT;

  return (
    <span
      ref={ref}
      aria-hidden="true"
      className={`flex items-end ${fill ? "justify-center" : "justify-between"} ${playing ? "" : "music-eq-paused"} ${className}`}
      style={fill ? { gap: EQ_BAR_GAP } : undefined}
    >
      {Array.from({ length: count }, (_, at) => (
        <span
          key={at}
          className="music-eq-bar shrink-0 rounded-full bg-violet"
          style={{
            width: EQ_BAR_WIDTH,
            height: HEIGHTS[at % HEIGHTS.length],
            animationDuration: `${DURATIONS[at % DURATIONS.length]}ms`,
            animationDelay: `${DELAYS[at % DELAYS.length]}ms`,
          }}
        />
      ))}
    </span>
  );
}
