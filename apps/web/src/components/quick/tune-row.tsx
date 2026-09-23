"use client";

import { Check, ChevronDown, ChevronUp, X } from "lucide-react";

/**
 * Строка настройки: галочка «показывать», стрелки «выше/ниже» и, если
 * строку можно убрать совсем, крестик. Одна на панель горячих кнопок и на
 * боковое меню (VED-408): настраиваются они одинаково, и человек, который
 * разобрался с одной, не должен учиться второй.
 *
 * Стрелками, а не перетаскиванием: панель и меню открывают с телефона одной
 * рукой, и жест на длинном списке промахивается чаще, чем попадает.
 *
 * `fixed` — галочку не снять (закреплённая или обязательная кнопка). Она не
 * гаснет, а объявляется недоступной через `aria-disabled`: кнопка остаётся в
 * порядке обхода табом, и скринридер успевает прочитать `note` — почему.
 *
 * Мелкая подпись идёт `--vm-text-1`: строки лежат на `--vm-bg-1`, где
 * `--vm-text-2` в тёмной теме даёт 4,29:1 — ниже AA (замер — в
 * `quick-panel.tsx`).
 */
export function TuneRow({
  label,
  hint,
  on,
  fixed = false,
  onToggle,
  onUp,
  onDown,
  onRemove,
  upLabel = "Выше",
  downLabel = "Ниже",
  removeLabel,
}: {
  label: string;
  hint: string;
  on: boolean;
  fixed?: boolean;
  onToggle: () => void;
  /** Нет колбэка — нет стрелки. */
  onUp?: () => void;
  onDown?: () => void;
  onRemove?: () => void;
  upLabel?: string;
  downLabel?: string;
  /** Имя крестика для скринридера, целиком. */
  removeLabel?: string;
}) {
  return (
    <li className="flex items-center gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-disabled={fixed || undefined}
        onClick={() => {
          if (!fixed) onToggle();
        }}
        className={`flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left ${
          fixed ? "cursor-default" : "hover:bg-white/4"
        }`}
      >
        <span
          aria-hidden="true"
          className={`flex size-4 shrink-0 items-center justify-center rounded border ${
            on ? "border-mint-edge bg-mint text-on-mint" : "border-glass-brd"
          }`}
        >
          {on && <Check className="size-3" />}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm text-text-0">{label}</span>
          <span className="block truncate text-[11px] text-text-1">{hint}</span>
        </span>
      </button>
      {onUp && (
        <button
          type="button"
          aria-label={`${upLabel}: ${label}`}
          onClick={onUp}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-text-2 hover:text-text-0"
        >
          <ChevronUp className="size-5" />
        </button>
      )}
      {onDown && (
        <button
          type="button"
          aria-label={`${downLabel}: ${label}`}
          onClick={onDown}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-text-2 hover:text-text-0"
        >
          <ChevronDown className="size-5" />
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          aria-label={removeLabel ?? label}
          onClick={onRemove}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-text-2 hover:text-text-0"
        >
          <X className="size-5" />
        </button>
      )}
    </li>
  );
}
