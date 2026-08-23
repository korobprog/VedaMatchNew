"use client";

import { useState } from "react";
import type { LibraryLocale } from "@vedamatch/shared";
import { requestLibrarySection } from "@/lib/library-admin-api";
import { t } from "./i18n";

/**
 * Заявка на новый раздел.
 *
 * Разделы заводит только администрация — участнику остаётся попросить.
 * Без этого выхода он либо кладёт материал не в тот раздел, либо не кладёт
 * вовсе; и то и другое хуже одной заявки в очереди.
 */
export function SectionRequestForm({ locale }: { locale: LibraryLocale }) {
  const [titleRu, setTitleRu] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!titleRu.trim() || !titleEn.trim()) {
      setError(t(locale, "add.sectionRequestTitles"));
      return;
    }
    setPending(true);
    try {
      await requestLibrarySection({
        titleRu: titleRu.trim(),
        titleEn: titleEn.trim(),
        reason: reason.trim() || null,
      });
      setSent(true);
    } catch {
      setError(t(locale, "add.failed"));
    } finally {
      setPending(false);
    }
  }

  if (sent)
    return (
      <p className="text-sm text-cyan">{t(locale, "add.sectionRequestSent")}</p>
    );

  // Не <form>: этот блок живёт внутри формы добавления материала, а
  // вложенный <form> невалиден и валит гидратацию.
  return (
    <div className="grid gap-3">
      <p className="text-xs text-text-2">
        {t(locale, "add.sectionRequestHint")}
      </p>

      <label className="text-sm text-text-1">
        {t(locale, "category.titleRu")}
        <input
          value={titleRu}
          onChange={(event) => setTitleRu(event.target.value)}
          className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
        />
      </label>

      <label className="text-sm text-text-1">
        {t(locale, "category.titleEn")}
        <input
          value={titleEn}
          onChange={(event) => setTitleEn(event.target.value)}
          className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
        />
      </label>

      <div>
        <label className="text-sm text-text-1">
          {t(locale, "add.sectionRequestReason")}
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            maxLength={1000}
            aria-describedby="section-request-reason-hint"
            className="mt-1 w-full rounded-xl border border-glass-brd bg-bg-0 p-2 text-text-0"
          />
        </label>
        <span
          id="section-request-reason-hint"
          className="mt-1 block text-xs text-text-2"
        >
          {t(locale, "add.sectionRequestReasonHint")}
        </span>
      </div>

      {error && <p className="text-xs text-magenta">{error}</p>}

      <button
        type="button"
        disabled={pending}
        onClick={() => void submit()}
        className="justify-self-start rounded-xl bg-glass-brd/40 px-4 py-2 text-sm text-text-0 hover:bg-glass-brd/60 disabled:opacity-50"
      >
        {t(locale, "add.sectionRequestSubmit")}
      </button>
    </div>
  );
}
