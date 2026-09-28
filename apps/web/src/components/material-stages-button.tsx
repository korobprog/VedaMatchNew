"use client";

import { useCallback, useId, useRef, useState } from "react";
import { Fingerprint } from "lucide-react";
import {
  AUDIENCE_STAGES,
  AUDIENCE_STAGE_LABELS,
  type SpiritualStage,
} from "@vedamatch/shared";
import { AnchoredPopover } from "@/components/anchored-popover";
import { MenuOptionLabel, menuOptionClass } from "@/components/menu-option";
import { MaterialMarksFooter } from "@/components/material-marks-footer";
import { useDismissable } from "@/lib/use-dismissable";
import {
  audienceStagesSummary,
  sameAudienceStages,
  toggleAudienceStage,
} from "@/lib/audience-stages";

/** Все четыре ступени — то же, что «для всех»: храним и показываем пустым. */
function normalize(stages: readonly SpiritualStage[]): SpiritualStage[] {
  return stages.length === AUDIENCE_STAGES.length ? [] : [...stages];
}

/**
 * Кнопка-значок «Самоидентификация» с отпечатком пальца — на каждом
 * материале, у всех участников (VED-632): для каких ступеней материал —
 * ищущий, практикующий, йог, преданный или все.
 *
 * Участник только смотрит; что видеть в лентах, он выбирает в «Фильтрах
 * материалов» на главной. Администратору сервис передаёт `onSave`, и в том
 * же окне ступени становятся мультивыбором (VED-575) с «Сохранить». Линия —
 * соседняя кнопка с домиком (`LineageInfoButton`).
 *
 * Портальный компонент, как и домик: одна кнопка на Образование и
 * Медиатеку, куда сохранить, решает сервис.
 */
export function MaterialStagesButton({
  stages,
  onSave,
  menuLabel = "Самоидентификация",
  className = "",
  buttonClassName = "rounded-full",
  sizeClassName = "size-11",
}: {
  /** Ступени материала; пусто — для всех. */
  stages: readonly SpiritualStage[];
  /** Сохранить ступени — только у администратора. */
  onSave?: (stages: SpiritualStage[]) => Promise<void>;
  /** Имя окна для скринридера. */
  menuLabel?: string;
  className?: string;
  buttonClassName?: string;
  sizeClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<SpiritualStage[]>(() => normalize(stages));
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  useDismissable(panelRef, close, open, triggerRef);

  const editable = onSave !== undefined;
  const label = `Самоидентификация: ${audienceStagesSummary(stages)}`;
  const forAll = (list: readonly SpiritualStage[]) =>
    list.length === 0 || list.length === AUDIENCE_STAGES.length;

  async function save() {
    if (!onSave) return;
    setError(null);
    if (sameAudienceStages(draft, stages)) {
      close();
      return;
    }
    setPending(true);
    try {
      await onSave(draft);
      close();
    } catch {
      setError("Не удалось сохранить ступени");
    } finally {
      setPending(false);
    }
  }

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
            setDraft(normalize(stages));
            setError(null);
          }
          setOpen(!open);
        }}
        /* Вид нейтральный, как у домика (VED-613, VED-632): без каёмок и
           счётчиков, что отмечено — видно в окне и в подписи кнопки. */
        className={`inline-flex ${sizeClassName} shrink-0 items-center justify-center border border-glass-brd text-text-1 hover:border-cyan/60 hover:text-text-0 transition-colors ${buttonClassName}`}
      >
        <Fingerprint aria-hidden className="size-4" />
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
          {editable ? (
            <div role="group" aria-label="Ступени самоидентификации">
              <p className="px-3 pb-1 pt-1 text-xs text-text-2">
                Кому показывать: одна или несколько ступеней. Без отметок —
                всем.
              </p>
              <button
                type="button"
                disabled={pending}
                aria-pressed={forAll(draft)}
                onClick={() => setDraft([])}
                className={menuOptionClass(forAll(draft))}
              >
                <MenuOptionLabel pressed={forAll(draft)}>
                  Для всех
                </MenuOptionLabel>
              </button>
              {AUDIENCE_STAGES.map((stage) => {
                const pressed = draft.includes(stage);
                return (
                  <button
                    key={stage}
                    type="button"
                    disabled={pending}
                    aria-pressed={pressed}
                    onClick={() =>
                      setDraft((current) =>
                        normalize(toggleAudienceStage(current, stage)),
                      )
                    }
                    className={menuOptionClass(pressed)}
                  >
                    <MenuOptionLabel pressed={pressed}>
                      {AUDIENCE_STAGE_LABELS[stage]}
                    </MenuOptionLabel>
                  </button>
                );
              })}
            </div>
          ) : (
            <dl className="px-3 py-1 text-sm">
              <div className="py-1.5">
                <dt className="text-xs text-text-2">Самоидентификация</dt>
                <dd className="font-semibold text-text-0">
                  {forAll(stages)
                    ? "Для всех"
                    : AUDIENCE_STAGES.filter((stage) => stages.includes(stage))
                        .map((stage) => AUDIENCE_STAGE_LABELS[stage])
                        .join(", ")}
                </dd>
              </div>
            </dl>
          )}
          {editable && (
            <MaterialMarksFooter
              pending={pending}
              error={error}
              onSave={() => void save()}
            />
          )}
        </AnchoredPopover>
      )}
    </div>
  );
}
