"use client";

import { useEffect, useState } from "react";

const ANIMATION_MS = 1200;

/**
 * Считает от 0 до `total` за ~1.2с при появлении. При
 * prefers-reduced-motion сразу показывает итог, без промежуточных кадров.
 */
export function MemberCounter({
  total,
  className,
}: {
  total: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReducedMotion) {
      setDisplay(total);
      return;
    }

    let frame: number;
    const start = performance.now();

    function tick() {
      const progress = Math.min(1, (performance.now() - start) / ANIMATION_MS);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * total));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [total]);

  return <span className={className}>{display.toLocaleString("ru-RU")}</span>;
}
