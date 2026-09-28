"use client";

import { useCallback, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Shapes } from "lucide-react";
import type { LibraryLocale } from "@vedamatch/shared";
import { AnchoredPopover } from "@/components/anchored-popover";
import { MenuOptionLabel, menuOptionClass } from "@/components/menu-option";
import { useDismissable } from "@/lib/use-dismissable";
import { ENTRY_FILTER_LANGUAGES, ENTRY_FILTER_TYPES } from "./entry-filters";
import { entryTypeLabel, t } from "./i18n";
import { LIBRARY_ICON_BUTTON } from "./icon-button";

/**
 * «Тип материала» и «Язык» значком на странице автора (VED-521): панель
 * фильтров с селектами там убрана, а выбор остался — кнопкой в ряду
 * действий, рядом с «Добавить». Выбор пишется в адрес (`?type=`,
 * `?language=`), как в панели фильтров: лента читает его оттуда же.
 *
 * «Язык» — не значком перевода, а самим языком: «RU», «EN», без выбора —
 * «Все» (VED-546). Код языка читается сразу, значок «文A» приходилось
 * угадывать.
 *
 * Меню — портальный `AnchoredPopover` (VED-604): от кнопки и целиком в
 * пределах экрана.
 */
export function EntryFilterMenu({
  kind,
  locale,
}: {
  kind: "type" | "language";
  locale: LibraryLocale;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  useDismissable(panelRef, close, open, triggerRef);

  const current = params.get(kind) ?? "";
  const label = t(
    locale,
    kind === "type" ? "filters.type" : "filters.language",
  );
  const options = (
    kind === "type" ? ENTRY_FILTER_TYPES : ENTRY_FILTER_LANGUAGES
  ).map((value) => ({
    value,
    label:
      kind === "type"
        ? entryTypeLabel(locale, value as (typeof ENTRY_FILTER_TYPES)[number])
        : value.toUpperCase(),
  }));
  const chosen = options.find((option) => option.value === current);

  function choose(value: string) {
    setOpen(false);
    const next = new URLSearchParams(params.toString());
    if (value) next.set(kind, value);
    else next.delete(kind);
    next.delete("cursor");
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const optionClass = menuOptionClass;

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={chosen ? `${label}: ${chosen.label}` : label}
        title={chosen ? `${label}: ${chosen.label}` : label}
        onClick={() => setOpen((value) => !value)}
        className={`${LIBRARY_ICON_BUTTON} border-glass-brd text-text-1 hover:text-text-0`}
      >
        {kind === "type" ? (
          <Shapes aria-hidden className="size-4" />
        ) : (
          <span aria-hidden className="font-mono text-xs font-semibold">
            {chosen ? chosen.label : t(locale, "filters.all")}
          </span>
        )}
      </button>
      {open && (
        <AnchoredPopover
          anchorRef={triggerRef}
          panelRef={panelRef}
          align="end"
          width={256}
          role="group"
          aria-label={label}
        >
          <p className="px-3 pb-1 text-xs text-text-2">{label}</p>
          <button
            type="button"
            aria-pressed={current === ""}
            onClick={() => choose("")}
            className={optionClass(current === "")}
          >
            <MenuOptionLabel pressed={current === ""}>
              {t(locale, "filters.all")}
            </MenuOptionLabel>
          </button>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={option.value === current}
              onClick={() => choose(option.value)}
              className={optionClass(option.value === current)}
            >
              <MenuOptionLabel pressed={option.value === current}>
                {option.label}
              </MenuOptionLabel>
            </button>
          ))}
        </AnchoredPopover>
      )}
    </div>
  );
}
