"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  anchoredPosition,
  type AnchoredPosition,
} from "@/lib/anchored-position";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Что в меню получает фокус при открытии: выбранный пункт, иначе первый. */
function initialFocus(panel: HTMLElement): HTMLElement {
  const selected = panel.querySelector<HTMLElement>(
    '[aria-pressed="true"]:not([disabled]), [aria-checked="true"]:not([disabled])',
  );
  return selected ?? panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
}

function viewportSize() {
  return {
    width: document.documentElement.clientWidth || window.innerWidth,
    height: window.innerHeight,
  };
}

function samePosition(a: AnchoredPosition | null, b: AnchoredPosition) {
  return a !== null && JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Выпадающее меню у кнопки (VED-604) — портальная инфраструктура для всех
 * меню-значков: «Линия», «Ступени», фильтры и категории Блог-ленты,
 * фильтры Образования.
 *
 * Рисуется порталом в `body` с `position: fixed`, поэтому ни карточка с
 * `overflow-hidden`, ни прокручиваемый ряд, ни перенос кнопки на новую
 * строку его больше не обрезают. Место считает `anchoredPosition`: меню
 * целиком в пределах экрана, при нехватке места — вверх или с прокруткой
 * внутри, на телефоне — нижним листом во всю ширину.
 *
 * Показывать — `{open && <AnchoredPopover …/>}`. Закрытие по Esc и клику
 * вне остаётся за `useDismissable(panelRef, …)` у вызывающего: портал
 * `contains` не ломает, `panelRef` указывает на само меню. При открытии
 * фокус уходит в меню — на выбранный пункт, если он есть; Tab ходит по
 * кругу внутри, пока меню не закроют.
 */
export function AnchoredPopover({
  anchorRef,
  panelRef,
  width = 288,
  align = "start",
  className = "",
  children,
  onKeyDown,
  ...rest
}: Omit<HTMLAttributes<HTMLDivElement>, "style" | "children"> & {
  /** Кнопка, от которой встаёт меню. */
  anchorRef: RefObject<HTMLElement | null>;
  /** Само меню — тот же ref, что у `useDismissable`. */
  panelRef: RefObject<HTMLDivElement | null>;
  /** Желаемая ширина в точках; на узком экране меньше. */
  width?: number;
  /** С какого края кнопки меню встаёт сначала. */
  align?: "start" | "end";
  children: ReactNode;
}) {
  const [position, setPosition] = useState<AnchoredPosition | null>(null);

  const update = useCallback(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const next = anchoredPosition(
      anchor.getBoundingClientRect(),
      { width, height: panel.scrollHeight },
      viewportSize(),
      { align },
    );
    setPosition((current) => (samePosition(current, next) ? current : next));
  }, [anchorRef, panelRef, width, align]);

  useLayoutEffect(() => {
    update();
    window.addEventListener("resize", update);
    // Прокрутка любого предка сдвигает кнопку — меню едет следом.
    window.addEventListener("scroll", update, true);
    window.visualViewport?.addEventListener("resize", update);
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (panelRef.current) observer?.observe(panelRef.current);
    if (anchorRef.current) observer?.observe(anchorRef.current);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.visualViewport?.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, [update, panelRef, anchorRef]);

  // Содержимое меняет высоту (раскрыли группу, пришла ошибка) — пересчёт.
  // Фокус — сюда же, как только место посчитано: невидимое на первом
  // замере меню фокус не принимает.
  const focused = useRef(false);
  useLayoutEffect(() => {
    update();
    const panel = panelRef.current;
    if (position && panel && !focused.current) {
      focused.current = true;
      initialFocus(panel).focus({ preventScroll: true });
    }
  });

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (typeof document === "undefined") return null;

  const sheet = position?.mode === "sheet";
  const style =
    position?.mode === "popover"
      ? {
          top: position.top,
          left: position.left,
          width: position.width,
          maxHeight: position.maxHeight,
        }
      : sheet
        ? undefined
        : // Первый замер: меню невидимо, пока не посчитано место.
          { top: 0, left: 0, width, visibility: "hidden" as const };

  return createPortal(
    <div
      {...rest}
      ref={panelRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      data-placement={
        position?.mode === "popover" ? position.placement : position?.mode
      }
      style={style}
      className={`fixed z-[65] overflow-y-auto overscroll-contain border border-glass-brd bg-bg-0 p-2 ${
        sheet
          ? "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl pb-[calc(env(safe-area-inset-bottom)+0.5rem)] shadow-2xl"
          : "rounded-2xl shadow-lg"
      } ${className}`}
    >
      {children}
    </div>,
    document.body,
  );
}
