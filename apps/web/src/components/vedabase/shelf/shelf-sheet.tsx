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
}: {
  open: boolean;
  title: string;
  onClose(): void;
  children: ReactNode;
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
      onClose={onClose}
      onClick={(event) => {
        // Клик мимо содержимого — по самому <dialog>, то есть по подложке.
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-0 mt-auto max-h-[85dvh] w-full max-w-none rounded-t-3xl border border-glass-brd bg-bg-0 p-0 text-text-0 backdrop:bg-black/60 sm:m-auto sm:max-w-lg sm:rounded-3xl"
    >
      <div className="flex max-h-[85dvh] flex-col">
        <header className="flex items-center gap-3 border-b border-glass-brd px-5 py-3">
          <h2 className="flex-grow font-display text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex size-11 items-center justify-center rounded-xl text-text-1 hover:bg-bg-2 hover:text-text-0"
          >
            <X aria-hidden className="size-5" />
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </dialog>
  );
}
