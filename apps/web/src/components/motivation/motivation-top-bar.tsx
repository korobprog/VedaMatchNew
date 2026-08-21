"use client";

import { useState } from "react";
import Link from "next/link";
import { MotivationNav, type MotivationSection } from "./motivation-nav";

/**
 * Шапка сервиса «Мотивация». Свёрнута по умолчанию: заголовок и список
 * разделов забирали около сотни точек высоты, а на телефоне ещё и уезжали в
 * горизонтальную прокрутку. Разделы раскрываются по нажатию и переносятся по
 * строкам — прокручивать ничего не нужно.
 */
export function MotivationTopBar({
  active,
  isAdmin,
  title = "Мотивация",
  action,
}: {
  active: MotivationSection;
  isAdmin: boolean;
  /** Название экрана: на вложенных страницах оно и есть заголовок. */
  title?: string;
  /** Ссылка справа — например, переключатель вида на ленте. */
  action?: { href: string; label: string };
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="px-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="motivation-sections"
          className="flex items-center gap-1.5 rounded-full px-1 py-1 font-display text-base font-bold text-text-0"
        >
          {title}
          <span aria-hidden="true" className={`text-xs text-text-2 transition-transform ${open ? "rotate-180" : ""}`}>
            ▾
          </span>
        </button>
        {action && (
          <Link
            href={action.href}
            className="rounded-full border border-glass-brd bg-glass px-3 py-1 text-xs font-medium text-text-1 hover:text-text-0"
          >
            {action.label}
          </Link>
        )}
      </div>
      {open && (
        <div id="motivation-sections" className="mt-1">
          <MotivationNav active={active} isAdmin={isAdmin} compact />
        </div>
      )}
    </div>
  );
}
