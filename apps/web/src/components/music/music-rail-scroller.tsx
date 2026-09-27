"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { fitRailWidth } from "./rail-fit";
import {
  RAIL_NUDGE_HOLD_MS,
  RAIL_NUDGE_KEY,
  localDay,
  railNudgeDistance,
  shouldNudgeRail,
} from "./rail-nudge";

/** Пауза после захода, прежде чем ряд поедет: пусть страница сперва встанет. */
const NUDGE_DELAY_MS = 600;

/**
 * Лента пунктов рельса на телефоне (VED-535).
 *
 * Окно ленты кончается за последним пунктом, влезшим целиком (`fitRailWidth`):
 * от следующего не видно ни края, ни значка, а рамка сужается вместе с окном
 * и потому не шире строки поиска над ней. Пересчёт — на каждое изменение
 * ширины экрана и самих пунктов (числа у «Избранного» и «Плейлистов»,
 * догрузка шрифта).
 *
 * Раз в день при заходе лента уезжает влево до конца, стоит и возвращается —
 * чтобы было видно, что её можно листать. На широком экране рельс — столбик:
 * окно не режется, листать нечего.
 */
export function MusicRailScroller({
  boxClassName,
  className,
  children,
}: {
  /** Рамка вокруг ленты — неподвижная, листается только список внутри. */
  boxClassName: string;
  className: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLUListElement>(null);

  // Окно по целой кнопке.
  useEffect(() => {
    const list = ref.current;
    const box = list?.parentElement;
    const host = box?.parentElement;
    if (!list || !box || !host) return;

    const measure = () => {
      const style = window.getComputedStyle(list);
      if (style.flexDirection === "column") {
        list.style.maxWidth = "";
        return;
      }
      // Поля и кромка рамки: всё, чем она шире самого списка.
      const chrome =
        box.getBoundingClientRect().width - list.getBoundingClientRect().width;
      const available = host.getBoundingClientRect().width - chrome;
      const items = Array.from(list.children) as HTMLElement[];
      const widths = items.map((item) => item.getBoundingClientRect().width);
      const gap = Number.parseFloat(style.columnGap) || 0;
      list.style.maxWidth = `${fitRailWidth(widths, gap, available)}px`;
    };

    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    for (const item of Array.from(list.children)) observer.observe(item);
    return () => observer.disconnect();
  }, []);

  // Подсказка «листается»: раз в день, на всю длину ряда.
  useEffect(() => {
    const list = ref.current;
    if (!list) return;
    let lastDay: string | null = null;
    try {
      lastDay = window.localStorage.getItem(RAIL_NUDGE_KEY);
    } catch {
      // Хранилище закрыто — подсказка покажется, но не чаще перезагрузки.
    }
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let back: number | undefined;
    // Длину меряем перед самым сдвигом, а не при заходе: к этому времени окно
    // уже подрезано по целой кнопке и шрифт догружен.
    const go = window.setTimeout(() => {
      const now = new Date();
      const distance = railNudgeDistance(list);
      if (
        !shouldNudgeRail({
          lastDay,
          now,
          scrollable: distance > 0,
          reducedMotion,
        })
      ) {
        return;
      }
      try {
        window.localStorage.setItem(RAIL_NUDGE_KEY, localDay(now));
      } catch {
        // См. выше.
      }
      list.scrollTo({ left: distance, behavior: "smooth" });
      back = window.setTimeout(
        () => list.scrollTo({ left: 0, behavior: "smooth" }),
        RAIL_NUDGE_HOLD_MS,
      );
    }, NUDGE_DELAY_MS);
    // Человек сам взялся за ленту — не выдёргиваем её у него из-под пальца.
    const stop = () => {
      window.clearTimeout(go);
      window.clearTimeout(back);
    };
    list.addEventListener("pointerdown", stop, { once: true });
    return () => {
      stop();
      list.removeEventListener("pointerdown", stop);
    };
  }, []);

  return (
    <div className={boxClassName}>
      <ul ref={ref} className={className}>
        {children}
      </ul>
    </div>
  );
}
