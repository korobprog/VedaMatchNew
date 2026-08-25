"use client";

import { useId, useState } from "react";

/**
 * Настройка со знаком вопроса: свёрнутое по умолчанию объяснение.
 *
 * Строка чекбокса не вмещает последствий настройки, а постоянно раскрытый
 * абзац под каждой галкой превращает форму в инструкцию. Поэтому подробности
 * прячутся за «?» и раскрываются по просьбе.
 *
 * Контрол приходит снаружи, а не оборачивается: кнопка обязана лежать вне
 * `<label>` — внутри неё клик по «?» переключал бы сам чекбокс.
 */
export function UnionHelpToggle({
  label,
  control,
  children,
}: {
  label: string;
  control: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="mt-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0">{control}</div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={label}
          className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-glass-brd text-xs font-semibold text-text-1 transition hover:border-cyan hover:text-cyan"
        >
          <span aria-hidden="true">?</span>
        </button>
      </div>
      {open && (
        <div
          id={panelId}
          className="mt-2 space-y-2 rounded-xl bg-bg-2 p-3 text-xs text-text-1"
        >
          {children}
        </div>
      )}
    </div>
  );
}
