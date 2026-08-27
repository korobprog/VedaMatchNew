"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { ASTRO_PURPOSE_TITLES } from "@vedamatch/shared";
import { VedaMatchMark } from "@/components/icons/vedamatch-mark";
import { TourFinger } from "./tour-cursor";
import { demoGunaMilan, demoPurposeNote } from "@/lib/landing/guna-milan-demo";
import {
  ASTRO_CURSOR_TRAVEL,
  ASTRO_DURATIONS,
  ASTRO_STEPS,
  ASTRO_TOUR_START,
  isAstroPressing,
  nextAstroState,
  shownPurpose,
  type AstroTourState,
} from "@/lib/landing/astro-tour";
import { cn } from "@/lib/utils";

/**
 * Витрина совместимости по звёздам: палец обходит цели сверки, и на глазах
 * видно, чем расчёт для дела короче сватовского.
 *
 * Числа демонстрационные, но устройство настоящее: набор кут и веса берутся
 * из той же таблицы `PURPOSE_KOOTAS`, по которой считает сервер, — витрина,
 * разошедшаяся с расчётом, врала бы ровно про то, что взялась объяснять.
 *
 * Целиком декоративна и скрыта от скринридера: то же самое сказано текстом в
 * разделе возможностей выше, а озвучка макета только удлинила бы путь.
 */
export function AstroMockup({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion();
  const [tour, setTour] = useState<AstroTourState>(ASTRO_TOUR_START);
  const [inView, setInView] = useState(false);
  const screenRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const running = !reduceMotion && inView;
  const purpose = running
    ? shownPurpose(tour, ASTRO_STEPS)
    : ASTRO_STEPS[0].purpose;
  const score = demoGunaMilan(purpose);
  const note = demoPurposeNote(purpose);
  const pressing = running && isAstroPressing(tour.phase);

  useEffect(() => {
    const screen = screenRef.current;
    if (!screen || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.4 },
    );
    observer.observe(screen);
    return () => observer.disconnect();
  }, []);

  const aim = useCallback(() => {
    const screen = screenRef.current;
    const button = screen?.querySelector(
      `[data-astro-purpose="${ASTRO_STEPS[tour.index].purpose}"]`,
    );
    if (!screen || !button) return;
    const from = screen.getBoundingClientRect();
    const to = button.getBoundingClientRect();
    setCursor({
      x: to.left - from.left + to.width / 2,
      y: to.top - from.top + to.height / 2,
    });
  }, [tour.index]);

  useLayoutEffect(() => {
    if (!running) return;
    aim();
  }, [aim, running]);

  useEffect(() => {
    if (!running) return;
    window.addEventListener("resize", aim);
    return () => window.removeEventListener("resize", aim);
  }, [aim, running]);

  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(
      () => setTour((state) => nextAstroState(state, ASTRO_STEPS.length)),
      ASTRO_DURATIONS[tour.phase],
    );
    return () => clearTimeout(timer);
  }, [running, tour]);

  return (
    <div aria-hidden className={cn("relative select-none", className)}>
      <div className="relative mx-auto w-[300px] md:w-[320px]">
        <div className="relative rounded-[40px] border border-glass-brd bg-bg-2 p-2 shadow-2xl shadow-black/50">
          <div className="absolute left-1/2 top-4 z-20 h-7 w-32 -translate-x-1/2 rounded-full bg-bg-0" />

          <div
            ref={screenRef}
            className="relative overflow-hidden rounded-[32px] bg-bg-0"
          >
            <div className="flex items-center justify-between bg-bg-1/50 px-6 py-3">
              <span className="font-mono text-xs text-text-0">9:41</span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-1 rounded-sm bg-text-0" />
                <span className="h-3 w-1 rounded-sm bg-text-0" />
                <span className="h-4 w-1 rounded-sm bg-text-0" />
              </span>
            </div>

            <div className="flex items-center gap-2 px-4 py-3">
              <VedaMatchMark className="h-7 w-7" />
              <span className="font-display text-sm font-bold text-text-0">
                Совместимость по звёздам
              </span>
            </div>

            <div className="px-3 pb-4">
              {/* Цели сверки — те же четыре, что и намерения в Знакомствах */}
              <div className="mb-3 grid grid-cols-4 gap-1.5">
                {ASTRO_STEPS.map((step) => (
                  <span
                    key={step.purpose}
                    data-astro-purpose={step.purpose}
                    className={cn(
                      "rounded-lg border px-1 py-1.5 text-center text-[10px] font-semibold transition-colors duration-200",
                      step.purpose === purpose
                        ? "border-mint-edge bg-mint text-on-mint"
                        : "border-glass-brd bg-glass text-text-1",
                    )}
                  >
                    {ASTRO_PURPOSE_TITLES[step.purpose]}
                  </span>
                ))}
              </div>

              <div className="mb-3 flex items-baseline justify-between rounded-xl border border-glass-brd bg-glass px-3 py-2">
                <span className="text-[11px] text-text-2">
                  Гуна-Милан · {score.title}
                </span>
                <span className="font-mono text-base font-bold text-text-0">
                  {score.totalPoints}
                  <span className="text-text-2"> / {score.maxPoints}</span>
                </span>
              </div>

              <dl className="space-y-1.5">
                {score.rows.map((row) => (
                  <div
                    key={row.key}
                    className={cn(
                      "transition-opacity duration-300",
                      // Неучтённая кута не исчезает, а гаснет: видно и что
                      // её не считают, и что она вообще есть.
                      row.counted ? "opacity-100" : "opacity-35",
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <dt className="text-[10px] text-text-1">{row.title}</dt>
                      <dd className="font-mono text-[10px] font-semibold text-text-0">
                        {row.counted ? `${row.points}/${row.maxPoints}` : "—"}
                      </dd>
                    </div>
                    <span className="mt-0.5 block h-1 overflow-hidden rounded-full bg-bg-2">
                      <span
                        className="block h-full rounded-full bg-gradient-to-r from-magenta to-violet transition-all duration-300"
                        style={{
                          width: row.counted
                            ? `${(row.points / row.maxPoints) * 100}%`
                            : "0%",
                        }}
                      />
                    </span>
                  </div>
                ))}
              </dl>

              {/* Высота держится постоянной: у семьи строки нет, и без запаса
                  таблица дёргалась бы на каждом переключении цели. */}
              <p className="mt-2.5 min-h-[2.2rem] text-[10px] leading-snug text-text-2">
                {note}
              </p>
            </div>

            {running && cursor && (
              <div
                className="pointer-events-none absolute left-0 top-0 z-40 transition-transform ease-in-out"
                style={{
                  transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)`,
                  transitionDuration: `${ASTRO_CURSOR_TRAVEL}ms`,
                }}
              >
                <TourFinger pressing={pressing} />
              </div>
            )}
          </div>
        </div>

        {running && (
          <p
            key={tour.index}
            className="preview-screen-in mx-auto mt-5 flex min-h-[3.5rem] max-w-[19rem] items-start justify-center text-center text-sm leading-snug text-text-1"
          >
            {ASTRO_STEPS[tour.index].caption}
          </p>
        )}

        <div className="absolute -inset-4 -z-10 bg-gradient-to-r from-violet/20 via-magenta/20 to-cyan/20 opacity-50 blur-xl" />
      </div>
    </div>
  );
}
