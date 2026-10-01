"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Шторка полки Библиотеки (VED-662): снизу на телефоне, по центру на
 * компьютере. Нативный `<dialog>` — фокус, Esc и подложка из коробки.
 */
export function ShelfSheet({
  open,
  title,
  onClose,
  children,
  surfaceClassName = "border-glass-brd bg-bg-0 text-text-0",
  side = false,
}: {
  open: boolean;
  title: string;
  onClose(): void;
  children: ReactNode;
  /** Подложка: портальная по умолчанию, у читалки — своя тема чтения. */
  surfaceClassName?: string;
  /** Колонкой у правого края во всю высоту (VED-677), а не шторкой снизу. */
  side?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      // `close` приходит и после программного `dialog.close()` из эффекта
      // выше, причём с опозданием — когда соседняя шторка уже открыта. Без
      // проверки переход «Содержание → Скачать книгу» закрывал вторую
      // шторку следом за первой. Закрытую снаружи шторку не закрываем снова.
      onClose={() => {
        if (open) onClose();
      }}
      onClick={(event) => {
        // Клик мимо содержимого — по самому <dialog>, то есть по подложке.
        if (event.target === event.currentTarget) onClose();
      }}
      className={`${
        side
          ? "m-0 ml-auto h-dvh max-h-dvh w-[min(90vw,22rem)] rounded-l-3xl"
          : "m-0 mt-auto max-h-[85dvh] w-full max-w-none rounded-t-3xl sm:m-auto sm:max-w-lg sm:rounded-3xl"
      } border p-0 backdrop:bg-black/60 ${surfaceClassName}`}
    >
      <div
        className={`flex flex-col [border-color:inherit] ${side ? "h-full" : "max-h-[85dvh]"}`}
      >
        <header className="flex items-center gap-3 border-b [border-color:inherit] px-5 py-3">
          <h2 className="flex-grow font-display text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex size-11 items-center justify-center rounded-xl opacity-80 hover:opacity-100"
          >
            <X aria-hidden className="size-5" />
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </dialog>
  );
}
