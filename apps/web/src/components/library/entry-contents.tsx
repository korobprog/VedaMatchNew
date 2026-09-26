"use client";

import { useEffect, useRef, useState } from "react";
import { ListOrdered } from "lucide-react";
import type { LibraryLocale } from "@vedamatch/shared";
import { t } from "./i18n";
import type { OutlineItem } from "./entry-outline";

/**
 * «Содержание» над текстом материала (VED-538): кнопка раскрывает список
 * разделов, пункт ведёт к своему абзацу (`#p-{index}`). С карточки в ленте
 * сюда приходят по `#contents` — тогда список раскрыт сразу.
 */
export function EntryContents({
  locale,
  items,
}: {
  locale: LibraryLocale;
  items: readonly OutlineItem[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.location.hash !== "#contents") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- адрес известен только в браузере
    setOpen(true);
    ref.current?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <div id="contents" ref={ref} className="mb-4 scroll-mt-24">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="contents-list"
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-glass-brd px-4 text-sm font-semibold text-text-1 hover:text-text-0"
      >
        <ListOrdered aria-hidden className="size-4" />
        {t(locale, "entry.contents")}
      </button>
      {open && (
        <ol
          id="contents-list"
          className="mt-2 flex flex-col rounded-2xl border border-glass-brd bg-bg-1 p-2"
        >
          {items.map((item) => (
            <li key={item.index}>
              <a
                href={`#p-${item.index}`}
                className="flex min-h-11 items-center rounded-xl px-3 text-sm text-text-1 hover:bg-glass hover:text-text-0"
              >
                {item.title}
              </a>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
