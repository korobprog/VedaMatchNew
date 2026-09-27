"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import {
  LONG_PRESS_MS,
  clampOffset,
  dragAxes,
  isDoubleTap,
  longPressPhase,
  nudgeOffset,
  popoverSide,
  settleOffset,
  viewportBounds,
  type Box,
  type DragAxes,
  type PlayerOffset,
  type Tap,
} from "./player-drag";

/**
 * Перетаскивание плеера долгим нажатием (VED-454). Логика жеста и геометрии
 * — в `player-drag.ts`, здесь только указатель, таймер и стили.
 *
 * Пока жест не сработал, страница листается как обычно: `touch-action` не
 * трогаем, а прокрутку гасит только постоянный непассивный `touchmove`,
 * и то лишь после срабатывания. Выставить `touch-action: none` посреди
 * жеста браузер уже не учтёт — он решает это на касании, — поэтому одного
 * его мало; ставим его на время перетаскивания для следующих касаний.
 */

/** Кнопки, ссылки и поля жест не перехватывает — у них своё нажатие. */
const INTERACTIVE =
  "button, a, input, select, textarea, label, [role='slider'], [role='dialog'], [data-player-popover], [data-player-drag]";

type Press = {
  pointerId: number;
  x: number;
  y: number;
  at: number;
  /** Нажали на свободное место, а не на ручку-кнопку. */
  free: boolean;
  fired: boolean;
  start: PlayerOffset;
  home: Box;
  bounds: Box;
  axes: DragAxes;
  last: PlayerOffset;
};

/** Вырезы экрана: `env()` из скрипта не прочитать, только через пробу. */
function readInsets() {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const insets = {
    top: parseFloat(style.paddingTop) || 0,
    right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
    left: parseFloat(style.paddingLeft) || 0,
  };
  probe.remove();
  return insets;
}

function readBounds(): Box {
  const header = document.querySelector("header");
  return viewportBounds({
    width: window.innerWidth,
    height: window.innerHeight,
    insets: readInsets(),
    headerBottom: header ? header.getBoundingClientRect().bottom : 0,
  });
}

/**
 * Где элемент стоит без сдвига. Полосу меряем от обёртки и `offsetTop`: на
 * них не влияет ни сдвиг, ни анимация выката (`transform`), которая иначе
 * дала бы посреди выката «дом» на высоту полосы ниже.
 */
function readHome(element: HTMLElement, wrap: HTMLElement | null): Box {
  if (wrap && element.offsetParent === wrap) {
    const outer = wrap.getBoundingClientRect();
    const left = outer.left + element.offsetLeft;
    const top = outer.top + element.offsetTop;
    return {
      left,
      top,
      right: left + element.offsetWidth,
      bottom: top + element.offsetHeight,
    };
  }
  const was = element.style.translate;
  element.style.translate = "none";
  const rect = element.getBoundingClientRect();
  element.style.translate = was;
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
  };
}

function paint(element: HTMLElement, offset: PlayerOffset | null) {
  element.style.translate = offset ? `${offset.x}px ${offset.y}px` : "";
}

export type PlayerDrag = ReturnType<typeof usePlayerDrag>;

export function usePlayerDrag({
  elementRef,
  wrapRef,
  offset,
  onCommit,
  onDoubleTap,
  axes: forcedAxes,
  popovers = false,
  nodeKey,
}: {
  elementRef: RefObject<HTMLElement | null>;
  wrapRef: RefObject<HTMLElement | null>;
  /** Сохранённый сдвиг; `null` — на месте. */
  offset: PlayerOffset | null;
  onCommit: (offset: PlayerOffset | null) => void;
  /** Двойное нажатие по свободному месту. */
  onDoubleTap?: () => void;
  /** Пузырь двигается по обеим осям всегда; полоса — по своей ширине. */
  axes?: DragAxes;
  /** Сообщать обёртке, куда открывать панели полосы. */
  popovers?: boolean;
  /** Меняется, когда элемент пересоздан (вид, выкат) — повесить слушатели заново. */
  nodeKey: string;
}) {
  const [dragging, setDragging] = useState(false);
  const pressRef = useRef<Press | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClickRef = useRef(false);
  const lastTapRef = useRef<Tap | null>(null);
  const offsetRef = useRef(offset);

  const measure = useCallback(() => {
    const element = elementRef.current;
    if (!element) return null;
    const home = readHome(element, wrapRef.current);
    const bounds = readBounds();
    return { home, bounds, axes: forcedAxes ?? dragAxes(home, bounds) };
  }, [elementRef, wrapRef, forcedAxes]);

  /** Панели полосы открываются туда, где есть место (см. `popoverSide`). */
  const markPopovers = useCallback(
    (
      geometry: { home: Box; bounds: Box } | null,
      shown: PlayerOffset | null,
    ) => {
      const wrap = wrapRef.current;
      if (!popovers || !wrap) return;
      if (!geometry || !shown) {
        delete wrap.dataset.popovers;
        wrap.style.removeProperty("--vm-player-room");
        return;
      }
      const { home, bounds } = geometry;
      const { side, room } = popoverSide(
        {
          left: home.left + shown.x,
          right: home.right + shown.x,
          top: home.top + shown.y,
          bottom: home.bottom + shown.y,
        },
        bounds,
      );
      wrap.dataset.popovers = side;
      wrap.style.setProperty("--vm-player-room", `${room}px`);
    },
    [popovers, wrapRef],
  );

  /** Нарисовать сохранённый сдвиг, зажав его в нынешнее окно. */
  const apply = useCallback(() => {
    const element = elementRef.current;
    if (!element || pressRef.current?.fired) return;
    const saved = offsetRef.current;
    if (!saved) {
      paint(element, null);
      markPopovers(null, null);
      return;
    }
    const geometry = measure();
    if (!geometry) return;
    const shown = clampOffset(
      saved,
      geometry.home,
      geometry.bounds,
      geometry.axes,
    );
    paint(element, shown);
    markPopovers(geometry, shown);
  }, [elementRef, measure, markPopovers]);

  useLayoutEffect(() => {
    offsetRef.current = offset;
    apply();
  }, [offset, apply, nodeKey]);

  // Окно поменялось — сдвиг зажимается заново: полоса, отнесённая к верху
  // на высоком экране, не должна уехать за край после поворота телефона.
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    window.addEventListener("resize", apply);
    const observer = new ResizeObserver(() => apply());
    observer.observe(element);
    return () => {
      window.removeEventListener("resize", apply);
      observer.disconnect();
    };
  }, [elementRef, apply, nodeKey]);

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const finish = useCallback(() => {
    clearTimer();
    const press = pressRef.current;
    pressRef.current = null;
    const element = elementRef.current;
    if (!press?.fired) return;
    if (element) element.style.touchAction = "";
    setDragging(false);
    // Щелчок после отпускания гасим (см. `onClickCapture`), но недолго:
    // если его не было — например, отпустили мимо, — следующее настоящее
    // нажатие не должно пропасть.
    suppressClickRef.current = true;
    setTimeout(() => {
      suppressClickRef.current = false;
    }, 350);
    const settled = settleOffset(press.last);
    offsetRef.current = settled;
    if (element) {
      paint(element, settled);
      markPopovers(press, settled);
    }
    onCommit(settled);
  }, [elementRef, markPopovers, onCommit]);

  const fire = useCallback(() => {
    const press = pressRef.current;
    const element = elementRef.current;
    const geometry = measure();
    if (!press || !element || !geometry) return;
    const start = offsetRef.current
      ? clampOffset(
          offsetRef.current,
          geometry.home,
          geometry.bounds,
          geometry.axes,
        )
      : { x: 0, y: 0 };
    Object.assign(press, { fired: true, start, last: start, ...geometry });
    element.style.touchAction = "none";
    try {
      element.setPointerCapture(press.pointerId);
    } catch {
      // Указатель уже отпущен — отпускание придёт следом.
    }
    window.getSelection()?.removeAllRanges();
    try {
      navigator.vibrate?.(12);
    } catch {
      // Вибрации нет — и не надо.
    }
    setDragging(true);
  }, [elementRef, measure]);

  // Гасим прокрутку страницы, только когда полоса уже схвачена. Слушатель
  // постоянный и непассивный: добавленный посреди касания браузер не учтёт.
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const onTouchMove = (event: TouchEvent) => {
      if (pressRef.current?.fired && event.cancelable) event.preventDefault();
    };
    element.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => element.removeEventListener("touchmove", onTouchMove);
  }, [elementRef, nodeKey]);

  useEffect(() => () => clearTimer(), []);

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.isPrimary === false) return;
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE) ?? null;
    const own = hit === event.currentTarget;
    const handle = hit?.hasAttribute("data-player-drag") ?? false;
    if (hit && !own && !handle) return;
    clearTimer();
    pressRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      at: Date.now(),
      free: !hit,
      fired: false,
      start: { x: 0, y: 0 },
      last: { x: 0, y: 0 },
      home: { left: 0, top: 0, right: 0, bottom: 0 },
      bounds: { left: 0, top: 0, right: 0, bottom: 0 },
      axes: "y",
    };
    timerRef.current = setTimeout(fire, LONG_PRESS_MS);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const press = pressRef.current;
    if (!press || event.pointerId !== press.pointerId) return;
    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;
    if (!press.fired) {
      if (
        longPressPhase({ elapsedMs: Date.now() - press.at, dx, dy }) ===
        "cancel"
      ) {
        clearTimer();
        pressRef.current = null;
      }
      return;
    }
    const element = elementRef.current;
    if (!element) return;
    const next = clampOffset(
      { x: press.start.x + dx, y: press.start.y + dy },
      press.home,
      press.bounds,
      press.axes,
    );
    press.last = next;
    paint(element, next);
    markPopovers(press, next);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const press = pressRef.current;
    if (!press || event.pointerId !== press.pointerId) return;
    if (press.fired) {
      finish();
      return;
    }
    clearTimer();
    pressRef.current = null;
    if (!press.free || !onDoubleTap) return;
    const tap = { at: Date.now(), x: event.clientX, y: event.clientY };
    if (isDoubleTap(lastTapRef.current, tap)) {
      lastTapRef.current = null;
      onDoubleTap();
    } else {
      lastTapRef.current = tap;
    }
  };

  const onPointerCancel = (event: ReactPointerEvent<HTMLElement>) => {
    const press = pressRef.current;
    if (!press || event.pointerId !== press.pointerId) return;
    if (press.fired) finish();
    else {
      clearTimer();
      pressRef.current = null;
    }
  };

  /** Отпускание после перетаскивания — не нажатие: пузырь не разворачивается. */
  const onClickCapture = (event: ReactMouseEvent<HTMLElement>) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  /** Меню ссылки и выделение по долгому нажатию спорили бы с жестом. */
  const onContextMenu = (event: ReactMouseEvent<HTMLElement>) => {
    if (pressRef.current) event.preventDefault();
  };

  /**
   * Кнопочная замена жеста (WCAG 2.5.7): сдвиг на шаг. Возвращает, куда
   * пришли, и сдвинулось ли вообще — у края кнопка молчит, и это надо
   * объявить.
   */
  const nudge = useCallback(
    (direction: "up" | "down") => {
      const geometry = measure();
      if (!geometry) return null;
      const from = offsetRef.current
        ? clampOffset(
            offsetRef.current,
            geometry.home,
            geometry.bounds,
            geometry.axes,
          )
        : null;
      const next = settleOffset(
        clampOffset(
          nudgeOffset(from, direction),
          geometry.home,
          geometry.bounds,
          geometry.axes,
        ),
      );
      const moved = (from?.y ?? 0) !== (next?.y ?? 0);
      return { offset: next, moved };
    },
    [measure],
  );

  return {
    dragging,
    nudge,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onClickCapture,
      onContextMenu,
    },
  };
}
