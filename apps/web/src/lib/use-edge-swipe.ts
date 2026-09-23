"use client";

import { useEffect, useRef } from "react";
import {
  edgeSwipeDirection,
  scrollAllowsEdgeSwipe,
  swipeVerdict,
  touchActionAllowsEdgeSwipe,
  type SwipeDirection,
  type SwipePoint,
} from "./edge-swipe";

export type EdgeSide = "left" | "right";

/**
 * На каких экранах работает жест: там же, где видно боковое меню
 * (`md:hidden` у панели в шапке). На планшете шире 768 меню в шапке целиком.
 */
const MOBILE_QUERY = "(max-width: 767.98px)";

/**
 * Слушатели касаний для свайпа от края (VED-191). Правила жеста — в
 * `edge-swipe.ts`, здесь только события.
 *
 * Пока панели закрыты, касание у края в сторону центра открывает панель
 * этой стороны. Пока панель открыта, горизонтальный мазок обратно — к её
 * краю — закрывает её: вытащил пальцем — пальцем и убрал.
 *
 * Слушатели пассивные: жест ничего не отменяет у браузера, поэтому
 * прокрутка страницы не ждёт наших обработчиков и не подтормаживает.
 */
export function useEdgeSwipe({
  open,
  onOpen,
  onClose,
}: {
  open: EdgeSide | null;
  onOpen: (side: EdgeSide) => void;
  onClose: () => void;
}) {
  // Колбэки через ref: слушатели вешаются один раз, а не на каждый рендер.
  const latest = useRef({ open, onOpen, onClose });
  useEffect(() => {
    latest.current = { open, onOpen, onClose };
  });

  useEffect(() => {
    let start: SwipePoint | null = null;
    let direction: SwipeDirection | null = null;

    const reset = () => {
      start = null;
      direction = null;
    };

    const onStart = (event: TouchEvent) => {
      reset();
      if (event.touches.length !== 1) return;
      if (!window.matchMedia?.(MOBILE_QUERY).matches) return;
      const touch = event.touches[0]!;
      const point = { x: touch.clientX, y: touch.clientY };
      const { open: side } = latest.current;

      if (side) {
        // Закрытие — мазком к краю своей панели, откуда угодно.
        start = point;
        direction = side === "right" ? "rightward" : "leftward";
        return;
      }

      const from = edgeSwipeDirection(point.x, window.innerWidth);
      if (!from) return;
      // Поверх другого модального окна (просмотр фото, шторка) меню не
      // выдвигаем: жест там принадлежит окну.
      if (document.querySelector('[aria-modal="true"]')) return;
      if (!targetAllowsSwipe(event.target, from)) return;
      start = point;
      direction = from;
    };

    const onMove = (event: TouchEvent) => {
      if (!start || !direction) return;
      if (event.touches.length !== 1) return reset();
      const touch = event.touches[0]!;
      const verdict = swipeVerdict(
        start,
        { x: touch.clientX, y: touch.clientY },
        direction,
      );
      if (verdict === "wait") return;
      const chosen = direction;
      reset();
      if (verdict === "cancel") return;
      const { open: side, onOpen: openSide, onClose: close } = latest.current;
      if (side) close();
      else openSide(chosen === "leftward" ? "right" : "left");
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", reset, { passive: true });
    window.addEventListener("touchcancel", reset, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", reset);
      window.removeEventListener("touchcancel", reset);
    };
  }, []);
}

/**
 * Не заберёт ли жест касание у элемента под пальцем: карусели, которой есть
 * куда листаться, или элемента, что сам разбирает горизонталь (правила — в
 * `edge-swipe.ts`). Проверяем всю цепочку предков: `touch-action` не
 * наследуется, а действует пересечением по ней.
 */
function targetAllowsSwipe(
  target: EventTarget | null,
  direction: SwipeDirection,
): boolean {
  let node = target instanceof Element ? target : null;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    if (!touchActionAllowsEdgeSwipe(style.touchAction ?? "")) return false;
    const scrolls =
      (style.overflowX === "auto" || style.overflowX === "scroll") &&
      node.scrollWidth > node.clientWidth;
    if (scrolls && !scrollAllowsEdgeSwipe(node, direction)) return false;
    node = node.parentElement;
  }
  return true;
}
