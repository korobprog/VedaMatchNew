"use client";

import { useId, useState } from "react";
import { lineageBadge, type LineageGroup } from "@vedamatch/shared";

/**
 * Метка духовной линии на карточках (VED-568). Портальный компонент, как и
 * `lineage-picker`: линия — одна на Образование, Медиатеку и профиль.
 *
 * Снаружи видна только группа — «ISKCON», «Гаудия-матх», «Паривары»: у
 * всех матхов одна метка, у всех паривар — тоже. Какой именно матх или
 * паривар, раскрывается нажатием на метку и сворачивается повторным. У
 * ISKCON раскрывать нечего, и метка остаётся простым текстом.
 *
 * Раскрывается на месте, а не всплывающим окном: карточки идут лентой, и
 * поповер над соседней карточкой закрывал бы её, а текст в строке читается
 * скринридером сразу после кнопки.
 */
export function LineageBadge({
  lineage,
  fallback,
  groupLabels,
  className = "",
}: {
  lineage: string | null | undefined;
  /** Что показать без линии («Для всех линий», «Не указана»). Без него — ничего. */
  fallback?: string;
  /** Подписи групп на языке страницы; по умолчанию — из справочника. */
  groupLabels?: Partial<Record<LineageGroup, string>>;
  /** Оформление метки — чип, строка списка: решает место. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const badge = lineageBadge(lineage);

  if (!badge) {
    return fallback ? <span className={className}>{fallback}</span> : null;
  }
  const label = groupLabels?.[badge.group] ?? badge.label;
  if (!badge.detail) return <span className={className}>{label}</span>;

  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailId}
        title={open ? undefined : badge.detail}
        onClick={() => setOpen((value) => !value)}
        className="underline decoration-dotted underline-offset-2 hover:text-text-0"
      >
        {label}
      </button>
      <span id={detailId} hidden={!open} className="text-text-0">
        <span aria-hidden>· </span>
        {badge.detail}
      </span>
    </span>
  );
}
