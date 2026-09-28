"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnchoredPopover } from "@/components/anchored-popover";
import { menuOptionClass } from "@/components/menu-option";
import { useDismissable } from "@/lib/use-dismissable";

/**
 * Кнопка-значок с меню для рядов Блог-ленты (VED-590): фильтры ленты и
 * «Назначить категорию» у поста. Высота и рамка — как у соседей по ряду
 * («Новый пост», «Порядок кнопок»), размер пальца 44px.
 *
 * Меню — портальный `AnchoredPopover` (VED-604): встаёт от кнопки и целиком
 * в пределах экрана, где бы кнопка ни оказалась в ряду.
 */
export const BLOG_ICON_BUTTON =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-lg border transition-colors";

/** Пункт меню: выбранный — с рамкой и галочкой (VED-596), как везде. */
export const blogMenuOptionClass = menuOptionClass;

export function BlogMenuButton({
  label,
  menuLabel,
  icon,
  busy = false,
  children,
}: {
  /** Имя кнопки — с текущим значением: «Категории постов: Новости». */
  label: string;
  /** Имя панели для скринридера. */
  menuLabel: string;
  icon: ReactNode;
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
        /* Без подсветки выбранного (VED-613): цветом выбор показывает только
           «Фильтры материалов» на главной, значение — в имени кнопки. */
        className={`${BLOG_ICON_BUTTON} border-glass-brd text-text-1 hover:border-cyan/60 hover:text-text-0`}
      >
        {icon}
      </button>
      {open && (
        <AnchoredPopover
          anchorRef={triggerRef}
          panelRef={panelRef}
          align="end"
          id={panelId}
          role="group"
          aria-label={menuLabel}
          aria-busy={busy || undefined}
        >
          {children(close)}
        </AnchoredPopover>
      )}
    </div>
  );
}
