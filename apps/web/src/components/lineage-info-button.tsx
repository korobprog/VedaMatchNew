"use client";

import { useCallback, useId, useRef, useState } from "react";
import { ChevronDown, Landmark } from "lucide-react";
import {
  lineageGroupOf,
  type LineageGroup,
  type LineageId,
} from "@vedamatch/shared";
import { AnchoredPopover } from "@/components/anchored-popover";
import { LineageLabel, WithLineageHelp } from "@/components/abbr-help";
import { MenuOptionLabel, menuOptionClass } from "@/components/menu-option";
import { MaterialMarksFooter } from "@/components/material-marks-footer";
import { useDismissable } from "@/lib/use-dismissable";
import { lineageInfoRows, type LineageInfoSubject } from "@/lib/lineage-info";
import { lineageMenuItems, lineageMenuOpenGroup } from "@/lib/lineage-menu";

/**
 * Кнопка-значок «Линия» с домиком — на каждом материале, у всех участников
 * (VED-616, VED-632): к какой духовной линии относится материал (катха,
 * статья, канал, запись, пост) и его автор.
 *
 * Участник только смотрит: что видеть в лентах, он выбирает в «Фильтрах
 * материалов» на главной (пояснение об этом в окне убрано, VED-635).
 * Администратору сервис
 * передаёт `onSave`, и в том же окне линия материала становится выбором с
 * кнопкой «Сохранить» (VED-632: «для админов то же самое, только помимо
 * отображения они могут менять и сохранять»). Ступени самоидентификации —
 * соседняя кнопка с отпечатком пальца (`MaterialStagesButton`).
 */
export function LineageInfoButton({
  subjects,
  onSave,
  className = "",
  buttonClassName = "rounded-full",
  sizeClassName = "size-11",
}: {
  /**
   * Что подписать: материал, автор. Первая строка — сам материал; её и
   * меняет администратор.
   */
  subjects: LineageInfoSubject[];
  /**
   * Сохранить линию материала — только у администратора. Ошибка
   * показывается в окне, выбор не сбрасывается.
   */
  onSave?: (lineage: LineageId | null) => Promise<void>;
  className?: string;
  buttonClassName?: string;
  sizeClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = subjects[0]?.lineage ?? null;
  const [draft, setDraft] = useState<LineageId | null>(current);
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
  const label = rows.map((row) => `${row.title}: ${row.value}`).join(". ");
  const editable = onSave !== undefined;
  // Админ правит первую строку — она в окне выбором, остальные (автор,
  // исполнитель) по-прежнему только показаны.
  const shownRows = editable ? rows.slice(1) : rows;
  const draftGroup = lineageGroupOf(draft);

  async function save() {
    if (!onSave) return;
    setError(null);
    if (draft === current) {
      close();
      return;
    }
    setPending(true);
    try {
      await onSave(draft);
      close();
    } catch {
      setError("Не удалось сохранить линию");
    } finally {
      setPending(false);
    }
  }

  function choice(value: LineageId | null, text: string) {
    const pressed = value === draft;
    return (
      <WithLineageHelp key={value ?? "none"} text={text}>
        <button
          type="button"
          disabled={pending}
          aria-pressed={pressed}
          onClick={() => setDraft(value)}
          className={menuOptionClass(pressed)}
        >
          <MenuOptionLabel pressed={pressed}>{text}</MenuOptionLabel>
        </button>
      </WithLineageHelp>
    );
  }

  const editor = editable && (
    <div role="group" aria-label={rows[0]?.title ?? "Линия"}>
      <p className="px-3 pb-1 pt-1 text-xs text-text-2">{rows[0]?.title}</p>
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
              className={`${menuOptionClass(draftGroup === item.group)} justify-between`}
            >
              <span className="min-w-0">
                {item.label}
                {draftGroup === item.group && expanded !== item.group && (
                  <span className="block text-xs font-normal text-text-1">
                    {
                      item.options.find((option) => option.value === draft)
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
  );

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`Линия. ${label}`}
        title={label}
        onClick={() => {
          if (!open) {
            setDraft(current);
            setExpanded(lineageMenuOpenGroup(current));
            setError(null);
          }
          setOpen(!open);
        }}
        /* Вид нейтральный, как у соседей по ряду (VED-613, отбой каёмок):
           выбор цветом показывает только «Фильтры материалов» на главной. */
        className={`inline-flex ${sizeClassName} shrink-0 items-center justify-center border border-glass-brd text-text-1 hover:border-cyan/60 hover:text-text-0 transition-colors ${buttonClassName}`}
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
          aria-label="Духовная линия"
          aria-busy={pending}
        >
          {editor}
          {shownRows.length > 0 && (
            <dl
              className={`px-3 py-1 text-sm ${
                editable ? "mt-1 border-t border-glass-brd pt-2" : ""
              }`}
            >
              {shownRows.map((row) => (
                <div key={row.title} className="py-1.5">
                  <dt className="text-xs text-text-2">{row.title}</dt>
                  <dd className="font-semibold text-text-0">
                    {/* Аббревиатура с «?» (VED-634): расшифровка по нажатию. */}
                    <LineageLabel text={row.value} />
                  </dd>
                </div>
              ))}
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
