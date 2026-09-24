"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import type {
  LibraryLocale,
  LineageGroup,
  LineageId,
  LineagePreference,
  LineageViewer,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { apiBase } from "@/lib/api-base";
import { useDismissable } from "@/lib/use-dismissable";
import { t } from "./i18n";
import {
  activeLineageChoice,
  hrefWithoutLineage,
  lineageChoiceGroup,
  lineageFilterMenu,
  preferenceForChoice,
  type LineageChoice,
} from "./lineage-filter";

const API_URL = apiBase();

/**
 * Фильтр по духовной линии в Образовании (VED-395, VED-449).
 *
 * Сначала это был ряд из одиннадцати кнопок (VED-395), но на телефоне он
 * уезжал вбок и занимал строку над рубриками. Заказчик попросил одну кнопку
 * «Фильтры» и внутри четыре позиции — «Всё», ИСККОН, «Гаудия-матх»,
 * «Паривары»; матхи и паривары — внутри своих групп.
 *
 * Выбор сохраняет настройку Образования, поэтому линия держится и в
 * рубриках, и при следующем заходе, а не живёт в одном адресе.
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
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
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
  const menu = lineageFilterMenu({
    all: t(locale, "lineage.menuAll"),
    groups: {
      iskcon: t(locale, "lineage.group.iskcon"),
      gaudiya_math: t(locale, "lineage.group.gaudiya_math"),
      parivara: t(locale, "lineage.group.parivara"),
    },
  });
  // Группа выбранной линии раскрыта сразу: видно, что именно выбрано.
  const [expanded, setExpanded] = useState<LineageGroup | null>(() =>
    lineageChoiceGroup(current),
  );

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  useDismissable(panelRef, close, open, triggerRef);

  async function choose(choice: LineageChoice) {
    if (busy || choice === current) {
      setOpen(false);
      return;
    }
    setOpen(false);
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

  const optionClass = (pressed: boolean) =>
    `flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm transition-colors ${
      pressed
        ? "bg-magenta/10 font-semibold text-text-0"
        : "text-text-1 hover:bg-bg-1 hover:text-text-0"
    }`;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-busy={busy}
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-4 text-sm transition-colors ${
          current === "all"
            ? "border-glass-brd text-text-1 hover:text-text-0"
            : "border-magenta text-text-0"
        }`}
      >
        <SlidersHorizontal aria-hidden className="size-4" />
        {t(locale, "lineage.menu")}
      </button>
      {open && (
        <div
          ref={panelRef}
          role="group"
          aria-label={t(locale, "lineage.filter")}
          className="absolute left-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-glass-brd bg-bg-0 p-2 shadow-lg"
        >
          {menu.map((item) =>
            item.kind === "choice" ? (
              <button
                key={item.option.value}
                type="button"
                aria-pressed={item.option.value === current}
                title={item.option.title}
                onClick={() => void choose(item.option.value)}
                className={optionClass(item.option.value === current)}
              >
                {item.option.label}
              </button>
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
                  className={`${optionClass(false)} justify-between`}
                >
                  {item.label}
                  <ChevronDown
                    aria-hidden
                    className={`size-4 transition-transform ${
                      expanded === item.group ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {expanded === item.group && (
                  <div className="ml-3 border-l border-glass-brd pl-2">
                    {item.options.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={option.value === current}
                        title={option.title}
                        onClick={() => void choose(option.value)}
                        className={optionClass(option.value === current)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ),
          )}
        </div>
      )}
      <p role="status" className="text-xs text-text-1">
        {failed ? t(locale, "lineage.filterFailed") : ""}
      </p>
    </div>
  );
}
