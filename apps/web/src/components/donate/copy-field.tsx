"use client";

import { useEffect, useState } from "react";
import { copyText } from "@/lib/copy-text";

/**
 * Значение с кнопкой «Копировать» — строка реквизита или готовое назначение
 * платежа. Реквизит набирают в приложении банка руками, и опечатка в счёте
 * стоит перевода, поэтому кнопка важнее, чем кажется.
 *
 * Не скопировалось (запрет буфера, старый браузер) — значение и так на экране,
 * поэтому молча ничего не происходит.
 */
export function CopyField({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string;
  /** Моноширинный шрифт: для номеров и счетов — да, для фраз — нет. */
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-glass-brd bg-bg-1 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-xs uppercase tracking-wide text-text-2">{label}</div>
        <div
          className={`break-words text-sm text-text-0 ${mono ? "font-mono" : ""}`}
        >
          {value}
        </div>
      </div>
      <button
        type="button"
        onClick={() => void copyText(value).then((ok) => ok && setCopied(true))}
        aria-live="polite"
        className="shrink-0 rounded-lg border border-glass-brd px-3 py-1 text-xs font-medium text-text-1 transition-colors hover:bg-bg-2 hover:text-text-0"
      >
        {copied ? "Скопировано" : "Копировать"}
      </button>
    </div>
  );
}
