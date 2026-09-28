"use client";

import { useCallback, useId, useRef, useState } from "react";
import { ChevronDown, Landmark } from "lucide-react";
import {
  lineageGroupOf,
  type LineageGroup,
  type LineageId,
} from "@vedamatch/shared";
import { useDismissable } from "@/lib/use-dismissable";
import {
  lineageButtonLabel,
  lineageMenuItems,
  lineageMenuOpenGroup,
} from "@/lib/lineage-menu";

/**
 * Кнопка-значок «Линия» с меню выбора (VED-561): ISKCON, матхи, паривары
 * или «без линии». Выбор в два шага, как везде (VED-568): Гаудия-матх и
 * Паривары раскрываются, и линия выбирается внутри группы. Портальный компонент, как и `lineage-picker`: линия — одна
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
  buttonClassName = "rounded-full",
  menuLabel = "Линия материала",
}: {
  value: LineageId | null;
  /** Сохранить выбор. Ошибка показывается под меню, выбор не меняется. */
  onSelect: (lineage: LineageId | null) => Promise<void>;
  /** Классы обёртки: место в ряду, например `ml-auto`. */
  className?: string;
  /**
   * Скругление кнопки под соседей по ряду: круглая в Образовании и
   * Медиатеке, со скруглёнными углами в ряду Блог-ленты (VED-596).
   */
  buttonClassName?: string;
  /** Имя панели для скринридера: «Линия материала», «Линия поста». */
  menuLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  // Раскрыта группа текущей линии: что выбрано, видно сразу.
  const [expanded, setExpanded] = useState<LineageGroup | null>(null);
  const currentGroup = lineageGroupOf(value);

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
        onClick={() => {
          if (!open) setExpanded(lineageMenuOpenGroup(value));
          setOpen(!open);
        }}
        className={`inline-flex size-11 shrink-0 items-center justify-center border border-glass-brd text-text-1 transition-colors hover:border-cyan/60 hover:text-text-0 ${buttonClassName}`}
      >
        <Landmark aria-hidden className="size-4" />
      </button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="group"
          aria-label={menuLabel}
          aria-busy={pending}
          className="absolute right-0 top-full z-30 mt-2 max-h-[60vh] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-glass-brd bg-bg-0 p-2 shadow-lg"
        >
          {lineageMenuItems().map((item) =>
            item.kind === "choice" ? (
              <button
                key={item.option.value ?? "none"}
                type="button"
                disabled={pending}
                aria-pressed={item.option.value === value}
                onClick={() => void choose(item.option.value)}
                className={optionClass(item.option.value === value)}
              >
                {item.option.label}
              </button>
            ) : (
              <div key={item.group}>
                <button
                  type="button"
                  aria-expanded={expanded === item.group}
                  onClick={() =>
                    setExpanded((current) =>
                      current === item.group ? null : item.group,
                    )
                  }
                  className={`${optionClass(currentGroup === item.group)} justify-between`}
                >
                  <span className="min-w-0">
                    {item.label}
                    {currentGroup === item.group && expanded !== item.group && (
                      <span className="block truncate text-xs font-normal text-text-1">
                        {
                          item.options.find((option) => option.value === value)
                            ?.label
                        }
                      </span>
                    )}
                  </span>
                  <ChevronDown
                    aria-hidden
                    className={`size-4 shrink-0 transition-transform ${
                      expanded === item.group ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {expanded === item.group && (
                  <div
                    role="group"
                    aria-label={item.label}
                    className="ml-3 border-l border-glass-brd pl-2"
                  >
                    {item.options.map((option) => (
                      <button
                        key={option.value}
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
                )}
              </div>
            ),
          )}
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
