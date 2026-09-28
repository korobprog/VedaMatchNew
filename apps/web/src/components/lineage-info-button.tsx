"use client";

import { useCallback, useId, useRef, useState } from "react";
import Link from "next/link";
import { Landmark } from "lucide-react";
import { AnchoredPopover } from "@/components/anchored-popover";
import { useDismissable } from "@/lib/use-dismissable";
import { lineageButtonToneClass } from "@/lib/lineage-menu";
import { lineageInfoRows, type LineageInfoSubject } from "@/lib/lineage-info";

/**
 * Кнопка-значок «Линия» с домиком — для всех участников (VED-616): к какой
 * духовной линии относится материал (катха, статья, канал, запись, пост) и
 * его автор. Нужна прежде всего тем, кто смотрит все линии без фильтров:
 * в общей ленте иначе не понять, чьё это.
 *
 * Только показывает. Разметку меняет админ кнопкой с отпечатком пальца
 * (`MaterialMarksMenuButton`), а что видеть в лентах, человек выбирает в
 * «Фильтрах материалов» на главной — на них ведёт ссылка внизу.
 */
export function LineageInfoButton({
  subjects,
  className = "",
  buttonClassName = "rounded-full",
  sizeClassName = "size-11",
}: {
  /** Что подписать: материал, автор. Первая строка — сам материал. */
  subjects: LineageInfoSubject[];
  className?: string;
  buttonClassName?: string;
  sizeClassName?: string;
}) {
  const [open, setOpen] = useState(false);
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
        onClick={() => setOpen(!open)}
        /* Каёмка (VED-613): у материала есть линия — светло-малиновая, «для
           всех линий» — зелёная. */
        className={`inline-flex ${sizeClassName} shrink-0 items-center justify-center border transition-colors hover:text-text-0 ${lineageButtonToneClass(subjects[0]?.lineage ?? null)} ${buttonClassName}`}
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
        >
          <dl className="px-3 py-1 text-sm">
            {rows.map((row) => (
              <div key={row.title} className="py-1.5">
                <dt className="text-xs text-text-2">{row.title}</dt>
                <dd className="font-semibold text-text-0">{row.value}</dd>
                {row.hint && (
                  <dd className="text-xs text-text-1">{row.hint}</dd>
                )}
              </div>
            ))}
          </dl>
          <p className="border-t border-glass-brd px-3 pb-1 pt-2 text-xs text-text-1">
            Какие линии показывать, выбирается в{" "}
            <Link
              href="/#material-filters"
              className="underline hover:text-text-0"
            >
              фильтрах материалов
            </Link>{" "}
            на главной.
          </p>
        </AnchoredPopover>
      )}
    </div>
  );
}
