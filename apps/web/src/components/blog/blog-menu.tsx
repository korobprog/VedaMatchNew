"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useDismissable } from "@/lib/use-dismissable";

/**
 * Кнопка-значок с меню для рядов Блог-ленты (VED-590): фильтры ленты и
 * «Назначить категорию» у поста. Высота и рамка — как у соседей по ряду
 * («Новый пост», «Порядок кнопок»), размер пальца 44px.
 *
 * Меню встаёт от правого края ряда, а не кнопки: у обёртки своей точки
 * отсчёта нет, ряд — `relative`. Кнопка на телефоне стоит где угодно, и
 * панель в 288 точек от её края уезжала бы за экран.
 */
export const BLOG_ICON_BUTTON =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-lg border transition-colors";

export function blogMenuOptionClass(pressed: boolean): string {
  return `flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm transition-colors disabled:opacity-50 ${
    pressed
      ? "bg-magenta/10 font-semibold text-text-0"
      : "text-text-1 hover:bg-bg-1 hover:text-text-0"
  }`;
}

export function BlogMenuButton({
  label,
  menuLabel,
  icon,
  active = false,
  busy = false,
  children,
}: {
  /** Имя кнопки — с текущим значением: «Категории постов: Новости». */
  label: string;
  /** Имя панели для скринридера. */
  menuLabel: string;
  icon: ReactNode;
  /** Выбрано не значение по умолчанию — рамка акцентом, как в Образовании. */
  active?: boolean;
  busy?: boolean;
  /** Пункты меню; `close` закрывает меню и возвращает фокус на кнопку. */
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const wasOpen = useRef(false);

  // Закрытое меню возвращает клавиатуру на кнопку — в эффекте, а не в
  // `close`: `close` уходит в пункты меню во время отрисовки, и трогать
  // ref оттуда нельзя.
  useEffect(() => {
    if (wasOpen.current && !open) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const close = useCallback(() => setOpen(false), []);
  useDismissable(panelRef, close, open, triggerRef);

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-busy={busy || undefined}
        aria-label={label}
        title={label}
        onClick={() => setOpen((value) => !value)}
        className={`${BLOG_ICON_BUTTON} ${
          active
            ? "border-magenta text-text-0"
            : "border-glass-brd text-text-1 hover:border-cyan/60 hover:text-text-0"
        }`}
      >
        {icon}
      </button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="group"
          aria-label={menuLabel}
          aria-busy={busy || undefined}
          className="absolute right-0 top-full z-30 mt-2 max-h-[60vh] w-72 max-w-full overflow-y-auto rounded-2xl border border-glass-brd bg-bg-0 p-2 shadow-lg"
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}
