"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Сворачиваемый блок окна шлоки: «Пословный перевод», «Комментарий».
 * Нажатие на заголовок разворачивает поле, второе — сворачивает (VED-386).
 *
 * Кнопка внутри заголовка, а не заголовок-кнопка: скринридер находит блок
 * в списке заголовков и слышит «свёрнуто/развёрнуто» из `aria-expanded`.
 * Свёрнутое содержимое снимается `hidden` — из дерева доступности тоже.
 */
export function ShlokaDisclosure({
  title,
  level = 2,
  defaultOpen = false,
  children,
}: {
  title: string;
  level?: 2 | 3 | 4;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const regionId = useId();
  const Heading = `h${level}` as "h2" | "h3" | "h4";

  return (
    <section className="rounded-2xl border border-glass-brd bg-bg-0/40">
      <Heading className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={regionId}
          onClick={() => setOpen((current) => !current)}
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left font-display text-sm font-semibold uppercase tracking-wide text-text-0 hover:bg-glass-brd/30"
        >
          <span>{title}</span>
          <ChevronDown
            aria-hidden
            className={`h-5 w-5 shrink-0 text-text-1 transition-transform motion-reduce:transition-none ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
      </Heading>
      <div id={regionId} hidden={!open} className="px-4 pb-4">
        {children}
      </div>
    </section>
  );
}
