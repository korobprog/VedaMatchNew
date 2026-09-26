"use client";

import { useEffect, useRef, type ReactNode } from "react";
import {
  RAIL_NUDGE_HOLD_MS,
  RAIL_NUDGE_KEY,
  localDay,
  shouldNudgeRail,
} from "./rail-nudge";

/**
 * Лента пунктов рельса на телефоне (VED-535). Раз в день при заходе
 * сдвигается влево на один пункт и возвращается — чтобы было видно, что её
 * можно листать. На широком экране рельс — столбик, листать нечего.
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

  useEffect(() => {
    const list = ref.current;
    if (!list) return;
    let lastDay: string | null = null;
    try {
      lastDay = window.localStorage.getItem(RAIL_NUDGE_KEY);
    } catch {
      // Хранилище закрыто — подсказка покажется, но не чаще перезагрузки.
    }
    const now = new Date();
    const nudge = shouldNudgeRail({
      lastDay,
      now,
      scrollable: list.scrollWidth > list.clientWidth + 1,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
        .matches,
    });
    if (!nudge) return;
    try {
      window.localStorage.setItem(RAIL_NUDGE_KEY, localDay(now));
    } catch {
      // См. выше.
    }
    // Ровно на один пункт: ширина первого плюс зазор до второго.
    const [first, second] = Array.from(list.children) as HTMLElement[];
    const step = second ? second.offsetLeft - first.offsetLeft : 0;
    if (step <= 0) return;
    const go = window.setTimeout(
      () => list.scrollTo({ left: step, behavior: "smooth" }),
      600,
    );
    const back = window.setTimeout(
      () => list.scrollTo({ left: 0, behavior: "smooth" }),
      600 + RAIL_NUDGE_HOLD_MS,
    );
    return () => {
      window.clearTimeout(go);
      window.clearTimeout(back);
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
