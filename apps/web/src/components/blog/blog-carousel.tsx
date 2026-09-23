"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Карусель ленты «как в Instagram» (VED-238): слайды во всю ширину, листаются
 * пальцем, у всех одна рамка.
 *
 * Листание — нативная прокрутка со `scroll-snap`, а не перетаскивание на JS:
 * так работают инерция, жесты системы и клавиатура (стрелки в фокусе на
 * ленте, Tab по ссылкам слайдов сам подкручивает к ним), и нет ни одной
 * анимации, которую пришлось бы выключать под `prefers-reduced-motion`.
 *
 * Стрелки поверх рамки видны только мыши — на наведении или при фокусе
 * внутри. На телефоне их нет: они закрывали бы собой края снимка, а заказчик
 * просил видеть его целиком. Отметка «2 / 5» — тот же приём, что у
 * Instagram: единственная подсказка, что листать есть куда.
 *
 * `perView` — сколько слайдов видно сразу на широком экране: на ноутбуке
 * снимок во всю ширину виджета был бы высотой в два экрана.
 */
export function BlogCarousel({
  count,
  label,
  renderSlide,
  perView = "one",
  dots = false,
}: {
  count: number;
  /** Имя группы для скринридера: «Блог-лента», «Вложения поста». */
  label: string;
  /** Содержимое слайда; рамку с пропорцией даёт `BlogFrame`. */
  renderSlide: (index: number) => ReactNode;
  perView?: "one" | "responsive";
  /** Точки под рамкой — в развороте поста; на главной их нет (чек-лист). */
  dots?: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [atEnd, setAtEnd] = useState(count <= 1);

  const sync = useCallback(() => {
    const node = scroller.current;
    if (!node) return;
    const first = node.firstElementChild as HTMLElement | null;
    const step = first?.offsetWidth || node.clientWidth || 1;
    setIndex(Math.min(count - 1, Math.max(0, Math.round(node.scrollLeft / step))));
    setAtEnd(node.scrollLeft + node.clientWidth >= node.scrollWidth - 2);
  }, [count]);

  useEffect(() => {
    sync();
    const node = scroller.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => observer.disconnect();
  }, [sync]);

  function go(direction: 1 | -1) {
    const node = scroller.current;
    if (!node) return;
    const first = node.firstElementChild as HTMLElement | null;
    const step = first?.offsetWidth || node.clientWidth;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    node.scrollBy({ left: direction * step, behavior: reduce ? "auto" : "smooth" });
  }

  const slideWidth =
    perView === "responsive" ? "w-full sm:w-1/2 lg:w-1/3" : "w-full";

  return (
    <div
      role="group"
      aria-roledescription="карусель"
      aria-label={label}
      className="group/carousel relative"
    >
      <div
        ref={scroller}
        onScroll={sync}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {Array.from({ length: count }, (_, slide) => (
          <div
            key={slide}
            role="group"
            aria-roledescription="слайд"
            aria-label={`${slide + 1} из ${count}`}
            className={`${slideWidth} shrink-0 snap-start`}
          >
            {renderSlide(slide)}
          </div>
        ))}
      </div>

      {count > 1 && (
        <>
          {/* Счётчик — поверх правого верхнего угла, как у Instagram. Фон
              плотный, а не стеклянный: под ним любая фотография, и контраст
              подписи обязан не зависеть от неё. */}
          <span
            aria-hidden
            className="pointer-events-none absolute right-2 top-2 rounded-full bg-bg-0/85 px-2 py-0.5 font-mono text-[11px] font-semibold text-text-0"
          >
            {index + 1} / {count}
          </span>
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={index === 0}
            aria-label="Предыдущий слайд"
            className="absolute left-2 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full border border-glass-brd bg-bg-0/90 text-text-0 opacity-0 transition-opacity focus-visible:opacity-100 disabled:invisible group-hover/carousel:opacity-100 group-focus-within/carousel:opacity-100 pointer-fine:flex"
          >
            <ChevronLeft aria-hidden className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            disabled={atEnd}
            aria-label="Следующий слайд"
            className="absolute right-2 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full border border-glass-brd bg-bg-0/90 text-text-0 opacity-0 transition-opacity focus-visible:opacity-100 disabled:invisible group-hover/carousel:opacity-100 group-focus-within/carousel:opacity-100 pointer-fine:flex"
          >
            <ChevronRight aria-hidden className="size-5" />
          </button>
        </>
      )}

      {dots && count > 1 && (
        <div aria-hidden className="flex justify-center gap-1 py-2">
          {Array.from({ length: count }, (_, dot) => (
            <span
              key={dot}
              className={`size-1.5 rounded-full ${
                dot === index ? "bg-cyan" : "bg-text-2/50"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Рамка вложения с заданной пропорцией. Снимок внутри вписывается целиком
 * (`object-contain`), поля рамки — подложкой `--vm-bg-2`.
 */
export function BlogFrame({
  aspect,
  children,
  className = "",
  maxHeight,
}: {
  aspect: number;
  children: ReactNode;
  className?: string;
  maxHeight?: string;
}) {
  return (
    <div
      className={`relative w-full overflow-hidden bg-bg-2 ${className}`}
      style={{ aspectRatio: String(aspect), maxHeight }}
    >
      {children}
    </div>
  );
}
