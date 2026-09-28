"use client";

import { useCallback, useId, useRef, useState } from "react";
import { Check, ChevronDown, Fingerprint } from "lucide-react";
import {
  AUDIENCE_STAGES,
  AUDIENCE_STAGE_LABELS,
  lineageGroupOf,
  type LineageGroup,
  type LineageId,
  type SpiritualStage,
} from "@vedamatch/shared";
import { Button } from "@/components/ui/button";
import { AnchoredPopover } from "@/components/anchored-popover";
import { MenuOptionLabel, menuOptionClass } from "@/components/menu-option";
import { useDismissable } from "@/lib/use-dismissable";
import { sameAudienceStages, toggleAudienceStage } from "@/lib/audience-stages";
import { lineageMenuItems, lineageMenuOpenGroup } from "@/lib/lineage-menu";
import {
  materialMarksButtonLabel,
  type MaterialMarks,
} from "@/lib/material-marks";

/**
 * Кнопка-значок «Разметка» с отпечатком пальца — только администратору
 * сервиса (VED-616): одно окно в две колонки, слева ступени
 * самоидентификации (мультивыбор, VED-575), справа духовная линия в том же
 * виде, что меню «Линия» (VED-561, VED-568). Разметкой админ решает, кому
 * материал виден в отфильтрованных лентах всех участников.
 *
 * Портальный компонент: разметка одна на Образование, Медиатеку и Блог, а
 * куда сохранить, решает сервис через `onSave`. Показывать ли кнопку, тоже
 * решает сервис. Без `stages` — одна колонка линии: у постов Блога ступеней
 * нет.
 *
 * Всё отмечается в черновике и сохраняется одной кнопкой: разметка — набор,
 * и сохранять каждую отметку по отдельности значило бы на полпути прятать
 * материал от тех, кому он ещё предназначен.
 */
export function MaterialMarksMenuButton({
  stages,
  lineage,
  onSave,
  className = "",
  buttonClassName = "rounded-full",
  sizeClassName = "size-11",
  menuLabel = "Разметка материала",
}: {
  /** Ступени материала; `undefined` — у сервиса их нет, колонки нет. */
  stages?: readonly SpiritualStage[];
  lineage: LineageId | null;
  /** Сохранить. Ошибка показывается под окном, выбор не меняется. */
  onSave: (next: MaterialMarks) => Promise<void>;
  /** Классы обёртки: место в ряду. */
  className?: string;
  /** Скругление под соседей по ряду. */
  buttonClassName?: string;
  /** Размер кнопки, по умолчанию 44px. */
  sizeClassName?: string;
  /** Имя окна для скринридера: «Разметка материала», «Разметка поста». */
  menuLabel?: string;
}) {
  const withStages = stages !== undefined;
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftStages, setDraftStages] = useState<SpiritualStage[]>([
    ...(stages ?? []),
  ]);
  const [draftLineage, setDraftLineage] = useState<LineageId | null>(lineage);
  const [expanded, setExpanded] = useState<LineageGroup | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  useDismissable(panelRef, close, open, triggerRef);

  const label = materialMarksButtonLabel({ stages, lineage });
  const currentGroup = lineageGroupOf(draftLineage);

  async function save(next: MaterialMarks) {
    setError(null);
    if (
      sameAudienceStages(next.stages, stages ?? []) &&
      next.lineage === lineage
    ) {
      close();
      return;
    }
    setPending(true);
    try {
      await onSave(next);
      close();
    } catch {
      setError("Не удалось сохранить разметку");
    } finally {
      setPending(false);
    }
  }

  // «Для всех» — материал без разметки: все ступени и без линии.
  const optionClass = menuOptionClass;
  const draftStagesAll =
    draftStages.length === 0 || draftStages.length === AUDIENCE_STAGES.length;
  const forAll = draftStagesAll && draftLineage === null;

  const lineageColumn = (
    <div role="group" aria-label="Духовная линия" className="min-w-0">
      <p className="px-2 pb-1 text-xs font-semibold text-text-1">Линия</p>
      {lineageMenuItems().map((item) =>
        item.kind === "choice" ? (
          <button
            key={item.option.value ?? "none"}
            type="button"
            disabled={pending}
            aria-pressed={item.option.value === draftLineage}
            onClick={() => setDraftLineage(item.option.value)}
            className={optionClass(item.option.value === draftLineage)}
          >
            <MenuOptionLabel pressed={item.option.value === draftLineage}>
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
                  <span className="block text-xs font-normal text-text-1">
                    {
                      item.options.find(
                        (option) => option.value === draftLineage,
                      )?.label
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
                className="ml-2 border-l border-glass-brd pl-1.5"
              >
                {item.options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    disabled={pending}
                    aria-pressed={option.value === draftLineage}
                    onClick={() => setDraftLineage(option.value)}
                    className={optionClass(option.value === draftLineage)}
                  >
                    <MenuOptionLabel pressed={option.value === draftLineage}>
                      {option.label}
                    </MenuOptionLabel>
                  </button>
                ))}
              </div>
            )}
          </div>
        ),
      )}
    </div>
  );

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
            setDraftStages([...(stages ?? [])]);
            setDraftLineage(lineage);
            setExpanded(lineageMenuOpenGroup(lineage));
            setError(null);
          }
          setOpen(!open);
        }}
        /* Вид нейтральный, без каёмок и счётчика (VED-613, отбой): что
           размечено, видно в окне и в подписи кнопки. */
        className={`inline-flex ${sizeClassName} shrink-0 items-center justify-center border border-glass-brd text-text-1 hover:border-cyan/60 hover:text-text-0 transition-colors ${buttonClassName}`}
      >
        <Fingerprint aria-hidden className="size-4" />
      </button>
      {open && (
        <AnchoredPopover
          anchorRef={triggerRef}
          panelRef={panelRef}
          width={withStages ? 520 : 288}
          align="end"
          id={panelId}
          role="group"
          aria-label={menuLabel}
          aria-busy={pending}
        >
          <p className="px-2 pb-2 pt-1 text-xs text-text-1">
            {withStages
              ? "Кому показывать: ступени (от одной до четырёх) и линия. Без отметок — всем."
              : "Какой линии пост. Без линии — всем."}
          </p>
          {withStages ? (
            /* Две колонки и на телефоне (VED-616): слева ступени, справа
               линии — обе разметки видны разом. */
            <div className="grid grid-cols-2 gap-2">
              <div
                role="group"
                aria-label="Ступени самоидентификации"
                className="min-w-0"
              >
                <p className="px-2 pb-1 text-xs font-semibold text-text-1">
                  Ступени
                </p>
                {AUDIENCE_STAGES.map((stage) => {
                  const pressed = draftStages.includes(stage);
                  return (
                    <button
                      key={stage}
                      type="button"
                      disabled={pending}
                      aria-pressed={pressed}
                      onClick={() =>
                        setDraftStages((current) =>
                          toggleAudienceStage(current, stage),
                        )
                      }
                      className={optionClass(pressed)}
                    >
                      <MenuOptionLabel pressed={pressed}>
                        {AUDIENCE_STAGE_LABELS[stage]}
                      </MenuOptionLabel>
                    </button>
                  );
                })}
              </div>
              {lineageColumn}
            </div>
          ) : (
            lineageColumn
          )}
          <div className="mt-2 flex gap-2 border-t border-glass-brd px-1 pt-2">
            <button
              type="button"
              disabled={pending}
              aria-pressed={forAll}
              onClick={() => void save({ stages: [], lineage: null })}
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
              onClick={() =>
                void save({ stages: draftStages, lineage: draftLineage })
              }
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
