"use client";

import { useState } from "react";
import { Check, Copy, Heart } from "lucide-react";

/**
 * Поддержка проекта. Платёжной интеграции у портала нет, поэтому здесь
 * реквизиты как есть, с копированием в один клик — честнее, чем кнопка
 * «оплатить», которая ведёт в никуда.
 */
export function DonateBlock({
  donate,
}: {
  donate: { note: string | null; details: string };
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(donate.details);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Буфер может быть недоступен — реквизиты и так видны, их можно выделить.
    }
  }

  return (
    <section
      aria-labelledby="donate"
      className="glass rounded-2xl border border-magenta/30 bg-magenta/5 p-4"
    >
      <h2
        id="donate"
        className="flex items-center gap-2 font-display text-lg font-semibold text-text-0"
      >
        <Heart className="h-5 w-5 text-text-1" aria-hidden="true" />
        Поддержать развитие
      </h2>

      {donate.note && (
        <p className="mt-2 whitespace-pre-line text-sm text-text-1">
          {donate.note}
        </p>
      )}

      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-glass-brd bg-bg-1 p-3 font-mono text-sm text-text-0">
        {donate.details}
      </pre>

      <button
        type="button"
        onClick={() => void copy()}
        className="mt-3 inline-flex items-center gap-2 rounded-xl border border-glass-brd px-3 py-2 text-sm text-text-1 transition-colors hover:text-text-0"
      >
        {copied ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Copy className="h-4 w-4" aria-hidden="true" />
        )}
        {copied ? "Скопировано" : "Скопировать реквизиты"}
      </button>
    </section>
  );
}
