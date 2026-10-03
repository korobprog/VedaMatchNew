"use client";

import { useCallback, useId, useRef, useState } from "react";
import { ChevronDown, Funnel } from "lucide-react";
import {
  AUDIENCE_STAGES,
  AUDIENCE_STAGE_LABELS,
  lineageGroupOf,
  type LineageGroup,
  type LineageId,
  type SpiritualStage,
} from "@vedamatch/shared";
import { AnchoredPopover } from "@/components/anchored-popover";
import { LineageLabel, WithLineageHelp } from "@/components/abbr-help";
import { MenuOptionLabel, menuOptionClass } from "@/components/menu-option";
import { MaterialMarksFooter } from "@/components/material-marks-footer";
import { useDismissable } from "@/lib/use-dismissable";
import {
  audienceStagesSummary,
  sameAudienceStages,
  toggleAudienceStage,
} from "@/lib/audience-stages";
import { lineageInfoRows, type LineageInfoSubject } from "@/lib/lineage-info";
import { lineageMenuItems, lineageMenuOpenGroup } from "@/lib/lineage-menu";

/** Все четыре ступени — то же, что «для всех»: храним и показываем пустым. */
function normalize(stages: readonly SpiritualStage[]): SpiritualStage[] {
  return stages.length === AUDIENCE_STAGES.length ? [] : [...stages];
}

/**
 * Одна кнопка-значок вместо пары «домик + отпечаток пальца» (VED-715):
 * фильтры материала — этап самоидентификации и духовная линия — в одном
 * окне, как «Фильтры материалов» на главной (VED-617): разделы «По
 * самоидентификации» и «По духовной линии» стоят рядом.
 *
 * Администратору (`onSaveStages`/`onSaveLineage`, право приходит с сервера)
 * окно раскрывается полным выбором — ступени мультивыбором, линия списком
 * с группами — и сохраняет нажатым «Сохранить»: так фильтры, которые ещё
 * не определены, задаются одним нажатием. Участник при том же нажатии видит
 * только зафиксированную админом индикацию обоих фильтров, редактировать
 * нечего — ни здесь, ни в других материалах с этими фильтрами.
 *
 * Портальный компонент: одна кнопка на Образование, Музыку и пост
 * блог-ленты, что сохранить, решает вызывающая сторона.
 */
export function MaterialMarksButton({
  stages,
  subjects,
  onSaveStages,
  onSaveLineage,
  menuLabel = "Фильтры материала",
  className = "",
  buttonClassName = "rounded-full",
  sizeClassName = "size-11",
}: {
  /** Ступени материала; пусто — для всех. */
  stages: readonly SpiritualStage[];
  /**
   * Что подписать: материал, автор, исполнитель. Первая строка — сам
   * материал; её и меняет администратор.
   */
  subjects: LineageInfoSubject[];
  /** Сохранить ступени — только у администратора. */
  onSaveStages?: (stages: SpiritualStage[]) => Promise<void>;
  /** Сохранить линию материала — только у администратора. */
  onSaveLineage?: (lineage: LineageId | null) => Promise<void>;
  /** Имя окна для скринридера. */
  menuLabel?: string;
  className?: string;
  buttonClassName?: string;
  sizeClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftStages, setDraftStages] = useState<SpiritualStage[]>(() =>
    normalize(stages),
  );
  const current = subjects[0]?.lineage ?? null;
  const [draftLineage, setDraftLineage] = useState<LineageId | null>(current);
  const [expanded, setExpanded] = useState<LineageGroup | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  useDismissable(panelRef, close, open, triggerRef);

  const rows = lineageInfoRows(subjects);
  const editable = onSaveStages !== undefined || onSaveLineage !== undefined;
  // Админ правит первую строку — она в окне выбором; автор, исполнитель и
  // исполнительская линия остаются только показанными.
  const shownRows = editable ? rows.slice(1) : rows;
  const label = [
    `Самоидентификация: ${audienceStagesSummary(stages)}`,
    ...rows.map((row) => `${row.title}: ${row.value}`),
  ].join(". ");
  const forAll = (list: readonly SpiritualStage[]) =>
    list.length === 0 || list.length === AUDIENCE_STAGES.length;
  const stagesText = (list: readonly SpiritualStage[]) =>
    forAll(list)
      ? "Для всех"
      : AUDIENCE_STAGES.filter((stage) => list.includes(stage))
          .map((stage) => AUDIENCE_STAGE_LABELS[stage])
          .join(", ");
  const draftGroup = lineageGroupOf(draftLineage);

  async function save() {
    setError(null);
    const nextStages = normalize(draftStages);
    const stagesChanged = !sameAudienceStages(nextStages, stages);
    const lineageChanged = draftLineage !== current;
    if (!stagesChanged && !lineageChanged) {
      close();
      return;
    }
    setPending(true);
    // Какая часть не сохранилась — так и скажем в окне.
    let step: "stages" | "lineage" = "stages";
    try {
      if (stagesChanged && onSaveStages) {
        step = "stages";
        await onSaveStages(nextStages);
      }
      if (lineageChanged && onSaveLineage) {
        step = "lineage";
        await onSaveLineage(draftLineage);
      }
      close();
    } catch {
      setError(
        step === "lineage"
          ? "Не удалось сохранить линию"
          : "Не удалось сохранить ступени",
      );
    } finally {
      setPending(false);
    }
  }

  function choice(value: LineageId | null, text: string) {
    const pressed = value === draftLineage;
    return (
      <WithLineageHelp key={value ?? "none"} text={text}>
        <button
          type="button"
          disabled={pending}
          aria-pressed={pressed}
          onClick={() => setDraftLineage(value)}
          className={menuOptionClass(pressed)}
        >
          <MenuOptionLabel pressed={pressed}>{text}</MenuOptionLabel>
        </button>
      </WithLineageHelp>
    );
  }

  const rowClass = (pressed: boolean) => menuOptionClass(pressed);

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
            setDraftStages(normalize(stages));
            setDraftLineage(current);
            setExpanded(lineageMenuOpenGroup(current));
            setError(null);
          }
          setOpen(!open);
        }}
        /* Вид нейтральный, как у соседей по ряду (VED-613): цветом выделяет
           только «Фильтры материалов» на главной. */
        className={`inline-flex ${sizeClassName} shrink-0 items-center justify-center border border-glass-brd text-text-1 hover:border-cyan/60 hover:text-text-0 transition-colors ${buttonClassName}`}
      >
        {/* Значок тот же, что у фильтров на главной (VED-715). */}
        <Funnel aria-hidden className="size-4" />
      </button>
      {open && (
        <AnchoredPopover
          anchorRef={triggerRef}
          panelRef={panelRef}
          width={editable ? 560 : 288}
          align="end"
          id={panelId}
          role="group"
          aria-label={menuLabel}
          aria-busy={pending}
        >
          {editable ? (
            <>
              <p className="px-3 pb-2 pt-1 text-xs text-text-1">
                Фильтры материала: кому показывать и из какой линии. Ступеней
                можно отметить несколько, линия — одна; без отметок материал
                видят все.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <fieldset className="min-w-0">
                  <legend className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-text-2">
                    По самоидентификации
                  </legend>
                  <div role="group" aria-label="Ступени самоидентификации">
                    <button
                      type="button"
                      disabled={pending}
                      aria-pressed={forAll(draftStages)}
                      onClick={() => setDraftStages([])}
                      className={rowClass(forAll(draftStages))}
                    >
                      <MenuOptionLabel pressed={forAll(draftStages)}>
                        Для всех
                      </MenuOptionLabel>
                    </button>
                    {AUDIENCE_STAGES.map((stage) => {
                      const pressed = draftStages.includes(stage);
                      return (
                        <button
                          key={stage}
                          type="button"
                          disabled={pending}
                          aria-pressed={pressed}
                          onClick={() =>
                            setDraftStages((currentDraft) =>
                              normalize(toggleAudienceStage(currentDraft, stage)),
                            )
                          }
                          className={rowClass(pressed)}
                        >
                          <MenuOptionLabel pressed={pressed}>
                            {AUDIENCE_STAGE_LABELS[stage]}
                          </MenuOptionLabel>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                <fieldset className="min-w-0">
                  <legend className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-text-2">
                    По духовной линии
                  </legend>
                  <div role="group" aria-label="Духовная линия">
                    {lineageMenuItems().map((item) =>
                      item.kind === "choice" ? (
                        choice(item.option.value, item.option.label)
                      ) : (
                        <div key={item.group}>
                          <button
                            type="button"
                            aria-expanded={expanded === item.group}
                            onClick={() =>
                              setExpanded((value) =>
                                value === item.group ? null : item.group,
                              )
                            }
                            className={`${rowClass(draftGroup === item.group)} justify-between`}
                          >
                            <span className="min-w-0">
                              {item.label}
                              {draftGroup === item.group &&
                                expanded !== item.group && (
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
                              {item.options.map((option) =>
                                choice(option.value, option.label),
                              )}
                            </div>
                          )}
                        </div>
                      ),
                    )}
                  </div>
                </fieldset>
              </div>
              {shownRows.length > 0 && (
                <dl className="mt-1 border-t border-glass-brd px-3 pt-1 text-sm">
                  {shownRows.map((row) => (
                    <div key={row.title} className="py-1.5">
                      <dt className="text-xs text-text-2">{row.title}</dt>
                      <dd className="font-semibold text-text-0">
                        <LineageLabel text={row.value} />
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              <MaterialMarksFooter
                pending={pending}
                error={error}
                onSave={() => void save()}
              />
            </>
          ) : (
            /* Участник только смотрит: оба фильтра, зафиксированные
               админом, без единого элемента ввода (VED-715). */
            <dl className="px-3 py-1 text-sm">
              <div className="py-1.5">
                <dt className="text-xs text-text-2">Самоидентификация</dt>
                <dd className="font-semibold text-text-0">
                  {stagesText(stages)}
                </dd>
              </div>
              {rows.map((row) => (
                <div key={row.title} className="py-1.5">
                  <dt className="text-xs text-text-2">{row.title}</dt>
                  <dd className="font-semibold text-text-0">
                    <LineageLabel text={row.value} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </AnchoredPopover>
      )}
    </div>
  );
}
