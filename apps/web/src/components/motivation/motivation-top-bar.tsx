"use client";

import { useState } from "react";
import Link from "next/link";
import { MotivationNav, type MotivationSection } from "./motivation-nav";

/**
 * Шапка сервиса «Вдохновение». Свёрнута по умолчанию: заголовок и список
 * разделов забирали около сотни точек высоты, а на телефоне ещё и уезжали в
 * горизонтальную прокрутку. Разделы раскрываются по нажатию и переносятся по
 * строкам — прокручивать ничего не нужно.
 */
export function MotivationTopBar({
  active,
  isAdmin,
  title = "Вдохновение",
  action,
  count,
}: {
  active: MotivationSection;
  isAdmin: boolean;
  /** Название экрана: на вложенных страницах оно и есть заголовок. */
  title?: string;
  /** Ссылка справа — например, переключатель вида на ленте. */
  action?: { href: string; label: string };
  /**
   * Сколько всего вдохновений в сервисе. Рядом с названием, а не отдельной
   * плашкой: это ответ на «а много ли тут вообще», и спрашивают его ровно
   * тогда, когда читают заголовок.
   */
  count?: number;
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
        {/* Рядом с названием, но не внутри кнопки: иначе имя кнопки читалось
            бы как «Вдохновение 348», и скринридер сообщал бы число каждый раз,
            когда до неё доходит фокус. */}
        {count !== undefined && count > 0 && (
          <span
            title={`Всего вдохновений: ${count}`}
            className="mr-auto font-mono text-xs font-medium text-text-2"
          >
            {count}
            <span className="sr-only"> вдохновений в сервисе</span>
          </span>
        )}
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
