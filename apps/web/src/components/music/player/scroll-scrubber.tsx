"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  scrollTopForThumb,
  thumbGeometry,
  type ThumbGeometry,
} from "./scroll-scrubber-geometry";

/**
 * Бегунок прокрутки для пальца (VED-478) у правого края панели. Узкая
 * полоска на виду, а область нажатия — 28px во всю высоту: тянешь в любом
 * месте полосы, и текст едет за пальцем. Для клавиатуры и читалки экрана
 * ничего не меняется — сама панель прокручивается как обычно, поэтому
 * бегунок `aria-hidden`.
 */
export function ScrollScrubber({
  target,
}: {
  target: RefObject<HTMLElement | null>;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [geometry, setGeometry] = useState<ThumbGeometry | null>(null);
  const grab = useRef<number | null>(null);

  useEffect(() => {
    const element = target.current;
    const track = trackRef.current;
    if (!element || !track) return;
    const update = () =>
      setGeometry(
        thumbGeometry(
          element.scrollTop,
          element.scrollHeight,
          element.clientHeight,
          track.clientHeight,
        ),
      );
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => {
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [target]);

  function moveTo(clientY: number) {
    const element = target.current;
    const track = trackRef.current;
    if (!element || !track || !geometry) return;
    const offset = grab.current ?? geometry.height / 2;
    const thumbTop = clientY - track.getBoundingClientRect().top - offset;
    element.scrollTop = scrollTopForThumb(
      thumbTop,
      track.clientHeight,
      geometry.height,
      element.scrollHeight - element.clientHeight,
    );
  }

  return (
    <div
      ref={trackRef}
      aria-hidden
      onPointerDown={(event) => {
        if (!geometry) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const top = trackRef.current?.getBoundingClientRect().top ?? 0;
        const within = event.clientY - top - geometry.top;
        // Взялись за сам бегунок — держим его за то же место; мимо —
        // прыгаем серединой бегунка к пальцу.
        grab.current = within >= 0 && within <= geometry.height ? within : null;
        moveTo(event.clientY);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          moveTo(event.clientY);
      }}
      onPointerUp={() => {
        grab.current = null;
      }}
      className={`absolute bottom-3 right-0 top-14 w-7 touch-none ${
        geometry ? "cursor-grab" : "pointer-events-none"
      }`}
    >
      {geometry && (
        <div
          className="absolute right-2 w-1.5 rounded-full bg-text-2"
          style={{ top: geometry.top, height: geometry.height }}
        />
      )}
    </div>
  );
}
