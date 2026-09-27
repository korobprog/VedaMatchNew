"use client";

import { useCallback, useId, useRef, useState } from "react";
import { Landmark } from "lucide-react";
import type { LineageId } from "@vedamatch/shared";
import { useDismissable } from "@/lib/use-dismissable";
import { lineageButtonLabel, lineageMenuGroups } from "@/lib/lineage-menu";

/**
 * Кнопка-значок «Линия» с меню выбора (VED-561): ISKCON, матхи, паривары
 * или «без линии». Портальный компонент, как и `lineage-picker`: линия — одна
 * на Образование и Медиатеку, а куда её сохранить, решает сервис через
 * `onSelect`. Показывать ли кнопку (только админам сервиса), тоже решает
 * сервис — здесь проверки прав нет.
 *
 * Меню раскрывается у правого края обёртки: у кнопки в конце ряда слева
 * место есть всегда, а вправо на телефоне оно уехало бы за экран.
 */
export function LineageMenuButton({
  value,
  onSelect,
  className = "",
}: {
  value: LineageId | null;
  /** Сохранить выбор. Ошибка показывается под меню, выбор не меняется. */
  onSelect: (lineage: LineageId | null) => Promise<void>;
  /** Классы обёртки: место в ряду, например `ml-auto`. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  useDismissable(panelRef, close, open, triggerRef);

  const label = lineageButtonLabel(value);

  async function choose(next: LineageId | null) {
    setError(null);
    if (next === value) {
      close();
      return;
    }
    setPending(true);
    try {
      await onSelect(next);
      close();
    } catch {
      setError("Не удалось сохранить линию");
    } finally {
      setPending(false);
    }
  }

  const optionClass = (pressed: boolean) =>
    `flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm transition-colors disabled:opacity-50 ${
      pressed
        ? "bg-magenta/10 font-semibold text-text-0"
        : "text-text-1 hover:bg-bg-1 hover:text-text-0"
    }`;

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={label}
        title={label}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-glass-brd text-text-1 transition-colors hover:border-cyan/60 hover:text-text-0"
      >
        <Landmark aria-hidden className="size-4" />
      </button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="group"
          aria-label="Линия материала"
          aria-busy={pending}
          className="absolute right-0 top-full z-30 mt-2 max-h-[60vh] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-glass-brd bg-bg-0 p-2 shadow-lg"
        >
          {lineageMenuGroups().map((group) => (
            <div
              key={group.key}
              role={group.label ? "group" : undefined}
              aria-label={group.label ?? undefined}
              className="py-1"
            >
              {group.label && (
                <p
                  aria-hidden
                  className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-text-2"
                >
                  {group.label}
                </p>
              )}
              {group.options.map((option) => (
                <button
                  key={option.value ?? "none"}
                  type="button"
                  disabled={pending}
                  aria-pressed={option.value === value}
                  onClick={() => void choose(option.value)}
                  className={optionClass(option.value === value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ))}
          {error && (
            <p role="alert" className="px-3 pt-1 text-xs text-magenta">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
