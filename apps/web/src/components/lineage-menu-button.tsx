"use client";

import { useCallback, useId, useRef, useState } from "react";
import { ChevronDown, Landmark } from "lucide-react";
import {
  lineageGroupOf,
  type LineageGroup,
  type LineageId,
} from "@vedamatch/shared";
import { AnchoredPopover } from "@/components/anchored-popover";
import { MenuOptionLabel, menuOptionClass } from "@/components/menu-option";
import { useDismissable } from "@/lib/use-dismissable";
import {
  lineageButtonLabel,
  lineageButtonToneClass,
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
 * Меню — `AnchoredPopover` (VED-604): порталом поверх страницы и целиком в
 * пределах экрана, где бы ни стояла кнопка.
 */
export function LineageMenuButton({
  value,
  onSelect,
  className = "",
  buttonClassName = "rounded-full",
  sizeClassName = "size-11",
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
  /**
   * Размер кнопки. По умолчанию 44px; в тесном ряду карточки Образования —
   * `size-10`, чтобы встать в строку с «Редактировать» и «Удалить» (VED-607).
   */
  sizeClassName?: string;
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

  const optionClass = menuOptionClass;

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
        className={`inline-flex ${sizeClassName} shrink-0 items-center justify-center border transition-colors hover:text-text-0 ${lineageButtonToneClass(value)} ${buttonClassName}`}
      >
        <Landmark aria-hidden className="size-4" />
      </button>
      {open && (
        <AnchoredPopover
          anchorRef={triggerRef}
          panelRef={panelRef}
          align="end"
          id={panelId}
          role="group"
          aria-label={menuLabel}
          aria-busy={pending}
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
                <MenuOptionLabel pressed={item.option.value === value}>
                  {item.option.label}
                </MenuOptionLabel>
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
                        <MenuOptionLabel pressed={option.value === value}>
                          {option.label}
                        </MenuOptionLabel>
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
        </AnchoredPopover>
      )}
    </div>
  );
}
