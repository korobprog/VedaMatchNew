"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import type {
  LibraryLocale,
  LineageId,
  LineagePreference,
  LineageViewer,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { apiBase } from "@/lib/api-base";
import { t } from "./i18n";
import {
  activeLineageChoice,
  hrefWithoutLineage,
  lineageFilterOptions,
  preferenceForChoice,
  type LineageChoice,
} from "./lineage-filter";

const API_URL = apiBase();

/**
 * Кнопки-фильтры по духовной линии над рубриками Образования (VED-395).
 *
 * Заменили выпадающий список «Как в профиле»: заказчик просил «клавиши» —
 * линии видны сразу, выбор в одно касание. Нажатие сохраняет настройку
 * Образования (как раньше список), поэтому выбранная линия держится и в
 * рубриках, и при следующем заходе, а не живёт в одном адресе.
 *
 * На телефоне ряд прокручивается вбок одной строкой — одиннадцать кнопок в
 * перенос заняли бы полэкрана над рубриками; с планшета — переносятся.
 */
export function LibraryLineageFilter({
  locale,
  applied,
  preference,
  viewer,
}: {
  locale: LibraryLocale;
  /** Линия, по которой API отфильтровал выдачу, — та же, что в подписи. */
  applied: LineageId | null;
  /** Сохранённая настройка Образования. */
  preference: LineagePreference;
  viewer: LineageViewer | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendingChoice, setPendingChoice] = useState<LineageChoice | null>(null);
  const [failed, setFailed] = useState(false);
  const [isRefreshing, startTransition] = useTransition();
  const rowRef = useRef<HTMLDivElement>(null);
  const navigating = useRef(false);

  // Нажатая кнопка горит, пока не придёт новая выдача: иначе между ответом
  // PATCH и обновлением страницы подсветка на миг возвращалась бы к старой.
  useEffect(() => {
    if (navigating.current && !isRefreshing) {
      navigating.current = false;
      setPendingChoice(null);
    }
  }, [isRefreshing]);

  const current = pendingChoice ?? activeLineageChoice(applied);
  const busy = pendingChoice !== null || isRefreshing;
  const options = lineageFilterOptions(t(locale, "lineage.all"));

  // Нажатая кнопка может оказаться за правым краем прокручиваемого ряда —
  // подвигаем ряд к ней, не трогая вертикальную прокрутку страницы.
  useEffect(() => {
    const row = rowRef.current;
    const active = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!row || !active || row.scrollWidth <= row.clientWidth) return;
    row.scrollLeft =
      active.offsetLeft - row.offsetLeft - (row.clientWidth - active.offsetWidth) / 2;
  }, [applied]);

  async function choose(choice: LineageChoice) {
    if (busy || choice === current) return;
    setFailed(false);
    setPendingChoice(choice);
    const next = preferenceForChoice(viewer, choice);
    try {
      if (next !== preference) {
        const response = await apiFetch(`${API_URL}/library/me/preferences`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lineage: next }),
        });
        if (!response.ok) throw new Error(String(response.status));
      }
      navigating.current = true;
      startTransition(() => {
        router.replace(hrefWithoutLineage(pathname, window.location.search), {
          scroll: false,
        });
        router.refresh();
      });
    } catch {
      setFailed(true);
      setPendingChoice(null);
    }
  }

  return (
    <div className="mb-4">
      <div
        ref={rowRef}
        role="group"
        aria-label={t(locale, "lineage.filter")}
        aria-busy={busy}
        className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
      >
        {options.map((option) => {
          const pressed = option.value === current;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={pressed}
              title={option.title}
              onClick={() => void choose(option.value)}
              className={`min-h-11 shrink-0 whitespace-nowrap rounded-xl border px-4 text-sm transition-colors ${
                pressed
                  ? "border-magenta bg-magenta/10 font-semibold text-text-0"
                  : "border-glass-brd bg-bg-0 text-text-1 hover:text-text-0"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <p role="status" className="text-xs text-text-1">
        {failed ? t(locale, "lineage.filterFailed") : ""}
      </p>
    </div>
  );
}
