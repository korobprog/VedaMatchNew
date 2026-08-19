"use client";

import { useEffect, type RefObject } from "react";

/**
 * Закрывает всплывающий элемент по Escape и по клику/тапу вне `ref`.
 * Пока `active === false`, ничего не слушает. `onClose` вызывается один раз
 * на событие; фокус возвращать — забота вызывающего (см. `useDialogFocus`).
 */
export function useDismissable(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  active = true,
) {
  useEffect(() => {
    if (!active) return;
    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (ref.current && target && !ref.current.contains(target)) onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [ref, onClose, active]);
}

/**
 * Поведение модального drawer/диалога: пока открыт — body не скроллится, а
 * фокус уходит внутрь; при закрытии — фокус возвращается на кнопку, которая
 * его открыла (`triggerRef`).
 */
export function useDialogFocus(
  open: boolean,
  dialogRef: RefObject<HTMLElement | null>,
  triggerRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusable = dialogRef.current?.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    (focusable ?? dialogRef.current)?.focus?.();

    return () => {
      document.body.style.overflow = previousOverflow;
      trigger?.focus?.();
    };
  }, [open, dialogRef, triggerRef]);
}
