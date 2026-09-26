"use client";

import { useCallback, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Languages, Shapes } from "lucide-react";
import type { LibraryLocale } from "@vedamatch/shared";
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
 * Меню раскрывается у правого края ряда — ряд `relative`, у обёртки своей
 * точки отсчёта нет: от кнопки на телефоне оно уезжало бы за экран.
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

  const Icon = kind === "type" ? Shapes : Languages;
  const optionClass = (pressed: boolean) =>
    `flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm transition-colors ${
      pressed
        ? "bg-magenta/10 font-semibold text-text-0"
        : "text-text-1 hover:bg-bg-1 hover:text-text-0"
    }`;

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
        className={`${LIBRARY_ICON_BUTTON} ${
          chosen
            ? "border-magenta text-text-0"
            : "border-glass-brd text-text-1 hover:text-text-0"
        }`}
      >
        <Icon aria-hidden className="size-4" />
      </button>
      {open && (
        <div
          ref={panelRef}
          role="group"
          aria-label={label}
          className="absolute right-0 top-full z-30 mt-2 max-h-[60vh] w-64 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-glass-brd bg-bg-0 p-2 shadow-lg"
        >
          <p className="px-3 pb-1 text-xs text-text-2">{label}</p>
          <button
            type="button"
            aria-pressed={current === ""}
            onClick={() => choose("")}
            className={optionClass(current === "")}
          >
            {t(locale, "filters.all")}
          </button>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={option.value === current}
              onClick={() => choose(option.value)}
              className={optionClass(option.value === current)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
