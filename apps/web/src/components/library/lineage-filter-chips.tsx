"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown, ListFilter } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import type {
  LibraryLocale,
  LineageFilterValue,
  LineageGroup,
  LineagePreference,
} from "@vedamatch/shared";
import { apiFetch } from "@/lib/http-client";
import { apiBase } from "@/lib/api-base";
import { AnchoredPopover } from "@/components/anchored-popover";
import { useDismissable } from "@/lib/use-dismissable";
import { t } from "./i18n";
import { LIBRARY_ICON_BUTTON } from "./icon-button";
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
 * «Паривары»; матхи и паривары — внутри своих групп. Пункта «Любой
 * Гаудия-матх» нет (VED-568): сохранённая раньше группа целиком подсвечивает
 * шапку группы без подписи линии под ней.
 *
 * Выбор сохраняет настройку Образования, поэтому линия держится и в
 * рубриках, и при следующем заходе, а не живёт в одном адресе.
 */
export function LibraryLineageFilter({
  locale,
  applied,
  preference,
  className = "",
  iconOnly = false,
}: {
  locale: LibraryLocale;
  /**
   * Линия или группа (`group:<группа>`, VED-568), по которой API
   * отфильтровал выдачу, — та же, что в подписи.
   */
  applied: LineageFilterValue | null;
  /** Сохранённая настройка Образования. */
  preference: LineagePreference;
  /** Раскладка снаружи: в ряду кнопок Образования кнопка тянется на ячейку. */
  className?: string;
  /**
   * Значком, без подписи на экране (VED-511) — ряд действий рубрики.
   */
  iconOnly?: boolean;
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
  // Группы свёрнуты (VED-483): «шапка Гаудия-матх должна быть свёрнута,
  // при нажатии разворачиваться». Что выбрано внутри — видно в самой шапке.
  const [expanded, setExpanded] = useState<LineageGroup | null>(null);
  const currentGroup = lineageChoiceGroup(current);
  // Линия внутри группы — подписью под шапкой. У группы целиком из старой
  // настройки (VED-568) подписи нет: пункта «Любой…» больше не существует.
  const lineageInGroup = (options: { value: LineageChoice; label: string }[]) =>
    options.find((option) => option.value === current)?.label;

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
    const next = preferenceForChoice(choice);
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
    // Меню — портальный `AnchoredPopover` (VED-604): от кнопки и целиком в
    // пределах экрана, где бы она ни стояла.
    <div className={className}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-busy={busy}
        onClick={() => setOpen((value) => !value)}
        aria-label={iconOnly ? t(locale, "lineage.menu") : undefined}
        title={iconOnly ? t(locale, "lineage.menu") : undefined}
        className={`${
          iconOnly
            ? LIBRARY_ICON_BUTTON
            : "inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border px-4 text-sm transition-colors"
        } ${
          current === "all"
            ? "border-glass-brd text-text-1 hover:text-text-0"
            : "border-magenta text-text-0"
        }`}
      >
        <ListFilter aria-hidden className="size-4" />
        {!iconOnly && t(locale, "lineage.menu")}
      </button>
      {open && (
        <AnchoredPopover
          anchorRef={triggerRef}
          panelRef={panelRef}
          align={iconOnly ? "end" : "start"}
          role="group"
          aria-label={t(locale, "lineage.filter")}
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
                  className={`${optionClass(currentGroup === item.group)} justify-between`}
                >
                  <span className="min-w-0">
                    {item.label}
                    {currentGroup === item.group &&
                      expanded !== item.group &&
                      lineageInGroup(item.options) && (
                        <span className="block truncate text-xs font-normal text-text-1">
                          {lineageInGroup(item.options)}
                        </span>
                      )}
                  </span>
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
        </AnchoredPopover>
      )}
      <p role="status" className="text-xs text-text-1">
        {failed ? t(locale, "lineage.filterFailed") : ""}
      </p>
    </div>
  );
}
