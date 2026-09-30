"use client";

import { Eraser } from "lucide-react";
import { VEDABASE_COLORS, type VedabaseColor } from "@vedamatch/shared";
import { COLOR_LABELS } from "@/lib/vedabase/color-spans";

/**
 * Палитра редактора цветного перевода (VED-683): выделил слова в блоке —
 * нажал цвет. «Стереть» снимает цвет с выделенного. Кнопки не забирают
 * фокус (preventDefault на mousedown) — иначе выделение пропало бы раньше
 * нажатия.
 */
export function ColoringBar({
  pending,
  dirty,
  hint,
  onPaint,
  onSave,
  onCancel,
}: {
  pending: boolean;
  dirty: boolean;
  hint: string | null;
  onPaint(color: VedabaseColor | null): void;
  onSave(): void;
  onCancel(): void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Цветной перевод: палитра"
      className="reader-subtle mb-3 flex flex-col gap-2 rounded-xl p-2"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {VEDABASE_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPaint(color)}
            aria-label={COLOR_LABELS[color]}
            title={COLOR_LABELS[color]}
            className="reader-bordered flex size-9 items-center justify-center rounded-lg border bg-[var(--reader-surface)]"
          >
            <span
              aria-hidden
              className={`reader-color-${color} text-lg font-bold leading-none`}
            >
              A
            </span>
          </button>
        ))}
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPaint(null)}
          aria-label="Стереть цвет"
          title="Стереть цвет"
          className="reader-bordered reader-hover flex size-9 items-center justify-center rounded-lg border"
        >
          <Eraser aria-hidden className="size-4" />
        </button>
        <span className="flex-grow" />
        <button
          type="button"
          onClick={onCancel}
          className="reader-hover min-h-9 rounded-lg px-3 text-sm"
        >
          Отмена
        </button>
        <button
          type="button"
          disabled={!dirty || pending}
          onClick={onSave}
          className="min-h-9 rounded-lg bg-gradient-to-r from-magenta to-[#B23EFF] px-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Сохраняем…" : "Сохранить"}
        </button>
      </div>
      <p className="reader-muted text-xs" role="status">
        {hint ?? "Выделите слова в этом блоке и нажмите цвет."}
      </p>
    </div>
  );
}
