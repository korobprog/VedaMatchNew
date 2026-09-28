"use client";

import { useCallback, useId, useRef, useState } from "react";
import { Check, Fingerprint } from "lucide-react";
import {
  AUDIENCE_STAGES,
  AUDIENCE_STAGE_LABELS,
  type SpiritualStage,
} from "@vedamatch/shared";
import { Button } from "@/components/ui/button";
import { AnchoredPopover } from "@/components/anchored-popover";
import { MenuOptionLabel, menuOptionClass } from "@/components/menu-option";
import { useDismissable } from "@/lib/use-dismissable";
import {
  audienceStagesButtonLabel,
  sameAudienceStages,
  toggleAudienceStage,
} from "@/lib/audience-stages";

/**
 * Кнопка-значок «Ступени» с мультивыбором (VED-575): для каких ступеней
 * самоидентификации материал — от одной до четырёх, или «для всех».
 * Портальный компонент, как `lineage-menu-button`: фильтр один на
 * Образование и Медиатеку, а куда сохранить, решает сервис через `onSave`.
 * Показывать ли кнопку (только админам сервиса), тоже решает сервис.
 *
 * Ступени отмечаются в черновике и сохраняются одной кнопкой: разметка —
 * набор, и сохранять каждую отметку по отдельности значило бы на полпути
 * прятать материал от тех, кому он ещё предназначен.
 *
 * Значок — отпечаток пальца: «самоидентификация» одним знаком, и он не
 * спутается с соседней «Линией» (здание).
 */
export function AudienceStagesMenuButton({
  value,
  onSave,
  className = "",
  sizeClassName = "size-11",
}: {
  value: readonly SpiritualStage[];
  /** Сохранить выбор. Ошибка показывается под меню, выбор не меняется. */
  onSave: (stages: SpiritualStage[]) => Promise<void>;
  /** Классы обёртки: место в ряду. */
  className?: string;
  /** Размер кнопки, по умолчанию 44px (см. `LineageMenuButton`, VED-607). */
  sizeClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<SpiritualStage[]>([...value]);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  useDismissable(panelRef, close, open, triggerRef);

  const label = audienceStagesButtonLabel(value);
  const marked = value.length > 0 && value.length < AUDIENCE_STAGES.length;

  async function save(next: SpiritualStage[]) {
    setError(null);
    if (sameAudienceStages(next, value)) {
      close();
      return;
    }
    setPending(true);
    try {
      await onSave(next);
      close();
    } catch {
      setError("Не удалось сохранить ступени");
    } finally {
      setPending(false);
    }
  }

  const optionClass = menuOptionClass;
  // «Для всех» — пустая разметка или все четыре ступени: выбор виден в
  // окне так же, как отмеченная ступень (VED-596).
  const forAll = draft.length === 0 || draft.length === AUDIENCE_STAGES.length;

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
          if (!open) {
            setDraft([...value]);
            setError(null);
          }
          setOpen(!open);
        }}
        className={`relative inline-flex ${sizeClassName} shrink-0 items-center justify-center rounded-full border transition-colors hover:text-text-0 ${
          marked
            ? "border-cyan/60 text-text-0"
            : "border-glass-brd text-text-1 hover:border-cyan/60"
        }`}
      >
        <Fingerprint aria-hidden className="size-4" />
        {/* Сколько ступеней отмечено — чтобы размеченное было видно, не
            открывая меню. Число дублирует имя кнопки и скрыто от чтения. */}
        {marked && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-magenta font-mono text-[10px] font-bold leading-none text-white tabular-nums"
          >
            {value.length}
          </span>
        )}
      </button>
      {open && (
        <AnchoredPopover
          anchorRef={triggerRef}
          panelRef={panelRef}
          align="end"
          id={panelId}
          role="group"
          aria-label="Ступени самоидентификации материала"
          aria-busy={pending}
        >
          <p className="px-3 pb-1 pt-1 text-xs text-text-1">
            Кому показывать: от одной до четырёх ступеней. Без отметок — всем.
          </p>
          {AUDIENCE_STAGES.map((stage) => {
            const pressed = draft.includes(stage);
            return (
              <button
                key={stage}
                type="button"
                disabled={pending}
                aria-pressed={pressed}
                onClick={() =>
                  setDraft((current) => toggleAudienceStage(current, stage))
                }
                className={optionClass(pressed)}
              >
                <MenuOptionLabel pressed={pressed}>
                  {AUDIENCE_STAGE_LABELS[stage]}
                </MenuOptionLabel>
              </button>
            );
          })}
          <div className="mt-2 flex gap-2 border-t border-glass-brd px-1 pt-2">
            <button
              type="button"
              disabled={pending}
              aria-pressed={forAll}
              onClick={() => void save([])}
              className={`inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm transition-colors disabled:opacity-50 ${
                forAll
                  ? "border-magenta bg-magenta/10 font-semibold text-text-0"
                  : "border-glass-brd text-text-1 hover:text-text-0"
              }`}
            >
              {forAll && (
                <Check aria-hidden className="size-4 shrink-0 text-magenta" />
              )}
              Для всех
            </button>
            <Button
              type="button"
              loading={pending}
              onClick={() => void save(draft)}
              className="min-h-11 flex-1"
            >
              Сохранить
            </Button>
          </div>
          {error && (
            <p role="alert" className="px-3 pt-2 text-xs text-magenta">
              {error}
            </p>
          )}
        </AnchoredPopover>
      )}
    </div>
  );
}
