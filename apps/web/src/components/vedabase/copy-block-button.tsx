"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyText } from "@/lib/copy-text";
import { readerBlockText } from "./block-text";

type CopyState = "idle" | "copied" | "failed";

/** Сколько держится «Скопировано»: заметить успеваешь, мешать не успевает. */
const FEEDBACK_MS = 2000;

/**
 * «Копировать» у раздела стиха (VED-130): перевод, комментарий и прочее
 * копируются по отдельности, без ручного выделения на телефоне.
 *
 * Текст готовится на нажатии, а не заранее: в главе больше сотни разделов, и
 * разбирать разметку каждого ради кнопки, которую нажмут в одном, незачем.
 */
export function CopyBlockButton({ html, label }: { html: string; label: string }) {
  const [state, setState] = useState<CopyState>("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    setState((await copyText(readerBlockText(html))) ? "copied" : "failed");
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={`Копировать: ${label}`}
      className="reader-muted reader-bordered reader-hover inline-flex min-h-8 flex-none items-center gap-1 rounded-lg border px-2 text-xs font-medium"
    >
      {state === "copied" ? (
        <Check aria-hidden className="size-3.5" />
      ) : (
        <Copy aria-hidden className="size-3.5" />
      )}
      {/* Итог читается и скринридером: подпись меняется в живой области. */}
      <span aria-live="polite">
        {state === "copied"
          ? "Скопировано"
          : state === "failed"
            ? "Не скопировалось"
            : "Копировать"}
      </span>
    </button>
  );
}
