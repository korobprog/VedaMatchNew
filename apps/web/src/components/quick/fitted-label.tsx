"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { pickFittingOption } from "@/lib/fit-text";

/**
 * Подпись в одну строку, которая выбирает себе вариант по ширине (VED-374,
 * VED-391).
 *
 * `options` — от полного к короткому. Рядом с подписью лежат невидимые
 * мерки — те же варианты без переноса, с тем же шрифтом (он наследуется, и
 * отдельно его знать не нужно). До отрисовки кадра (`useLayoutEffect`)
 * плитка сравнивает их ширину со своей и оставляет первый вариант, что
 * влез. Меряет заново, когда меняется ширина (поворот экрана, другая
 * раскладка панели) и когда догрузился шрифт: до этого ширина мерок —
 * ширина запасного.
 *
 * Без `ResizeObserver` (очень старый браузер) подпись остаётся полной, а
 * дорезает её `truncate` — значок от этого не сдвигается.
 */
export function FittedLabel({ options }: { options: readonly string[] }) {
  const labelRef = useRef<HTMLSpanElement>(null);
  const probesRef = useRef<HTMLSpanElement>(null);
  const [picked, setPicked] = useState<{ key: string; index: number } | null>(
    null,
  );
  // Ключ — сами варианты: у окна сменилось место, и прежний выбор не годится.
  const key = options.join("\u0000");

  useLayoutEffect(() => {
    const label = labelRef.current;
    const probes = probesRef.current;
    if (!label || !probes || typeof ResizeObserver === "undefined") return;
    const fit = () => {
      const widths = Array.from(
        probes.children,
        (probe) => probe.getBoundingClientRect().width,
      );
      const index = pickFittingOption(
        widths,
        label.clientWidth,
        (width) => width,
      );
      setPicked((prev) =>
        prev?.key === key && prev.index === index ? prev : { key, index },
      );
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(label);
    let alive = true;
    void document.fonts?.ready.then(() => {
      if (alive) fit();
    });
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [key]);

  const index = picked?.key === key ? picked.index : 0;
  return (
    <>
      <span ref={labelRef} className="w-full truncate">
        {options[index] ?? options[0]}
      </span>
      <span
        ref={probesRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap"
      >
        {options.map((option) => (
          <span key={option} className="block w-max">
            {option}
          </span>
        ))}
      </span>
    </>
  );
}
