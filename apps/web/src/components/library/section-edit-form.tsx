"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LibraryLocale, LibrarySectionDto } from "@vedamatch/shared";
import { Pencil } from "lucide-react";
import { t } from "./i18n";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Разделы правит только администрация — кнопка появляется только у неё (canEdit). */
export function SectionEditForm({
  locale,
  section,
}: {
  locale: LibraryLocale;
  section: LibrarySectionDto;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [titleRu, setTitleRu] = useState(section.titleRu);
  const [titleEn, setTitleEn] = useState(section.titleEn);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!section.canEdit) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          setOpen(true);
        }}
        aria-label={t(locale, "section.edit")}
        className="shrink-0 text-text-2 hover:text-text-0"
      >
        <Pencil aria-hidden className="h-3.5 w-3.5" />
      </button>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    setError(null);
    if (!titleRu.trim() || !titleEn.trim()) {
      setError(t(locale, "add.titleRequired"));
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`${API_URL}/library/sections/${section.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titleRu: titleRu.trim(),
          titleEn: titleEn.trim(),
        }),
      });
      if (!res.ok) {
        setError(t(locale, "add.failed"));
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError(t(locale, "add.failed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      onClick={(event) => event.preventDefault()}
      className="w-72 max-w-full rounded-xl border border-glass-brd bg-bg-1 p-3 text-sm shadow-xl"
    >
      <p className="mb-2 text-text-2">{t(locale, "section.edit")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-text-1">
          {t(locale, "category.titleRu")}
          <input
            value={titleRu}
            onChange={(event) => setTitleRu(event.target.value)}
            className="mt-1 w-full rounded-lg border border-glass-brd bg-bg-0 p-1.5 text-text-0"
          />
        </label>
        <label className="text-text-1">
          {t(locale, "category.titleEn")}
          <input
            value={titleEn}
            onChange={(event) => setTitleEn(event.target.value)}
            className="mt-1 w-full rounded-lg border border-glass-brd bg-bg-0 p-1.5 text-text-0"
          />
        </label>
      </div>
      {error && <p className="mt-2 text-xs text-magenta">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-glass-brd/40 px-3 py-1.5 text-xs text-text-0 hover:bg-glass-brd/60 disabled:opacity-50"
        >
          {t(locale, "entry.save")}
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            setOpen(false);
          }}
          className="rounded-lg border border-glass-brd px-3 py-1.5 text-xs text-text-1 hover:text-text-0"
        >
          {t(locale, "entry.cancel")}
        </button>
      </div>
    </form>
  );
}
