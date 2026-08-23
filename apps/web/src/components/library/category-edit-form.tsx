"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LibraryCategoryDto, LibraryLocale } from "@vedamatch/shared";
import { Pencil } from "lucide-react";
import { pickLocalized, t } from "./i18n";
import { apiFetch } from "@/lib/http-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Правится только название/описание — раздел (sectionId) в этой форме не
 * трогаем: перенос категории между разделами ломает уже выданные ссылки
 * на `/library/[section]/[category]` чаще, чем того стоит компактная форма.
 */
export function CategoryEditForm({
  locale,
  category,
  onSaved,
}: {
  locale: LibraryLocale;
  category: LibraryCategoryDto;
  /**
   * Формы добавления/редактирования материала держат свой список категорий
   * в состоянии — без колбэка переименование становится видно только после
   * `router.refresh()` пересоздаст их с нуля (следующее открытие формы).
   */
  onSaved?: (category: LibraryCategoryDto) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [titleRu, setTitleRu] = useState(category.titleRu ?? "");
  const [titleEn, setTitleEn] = useState(category.titleEn ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!category.canEdit) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t(locale, "category.edit")}
        className="ml-1 inline-flex text-text-2 hover:text-text-0"
      >
        <Pencil aria-hidden className="h-3.5 w-3.5" />
      </button>
    );
  }

  async function submit() {
    setError(null);
    if (!titleRu.trim() && !titleEn.trim()) {
      setError(t(locale, "add.titleRequired"));
      return;
    }
    setPending(true);
    try {
      const res = await apiFetch(`${API_URL}/library/categories/${category.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titleRu: titleRu.trim() || null,
          titleEn: titleEn.trim() || null,
        }),
      });
      if (!res.ok) {
        setError(t(locale, "add.failed"));
        return;
      }
      const updated = (await res.json()) as LibraryCategoryDto;
      setOpen(false);
      onSaved?.(updated);
      router.refresh();
    } catch {
      setError(t(locale, "add.failed"));
    } finally {
      setPending(false);
    }
  }

  // Не <form>: этот попап встраивается и внутрь формы добавления/редактирования
  // материала (add-entry-form.tsx, edit-entry-form.tsx) — вложенный <form> там
  // невалиден и валит гидратацию, как раньше было с вложенными <button>.
  function handleKeyDown(event: React.KeyboardEvent) {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <div
      onClick={(event) => event.stopPropagation()}
      className="relative z-10 mt-2 w-64 max-w-full rounded-xl border border-glass-brd bg-bg-1 p-3 text-sm shadow-xl"
    >
      <p className="mb-2 text-text-2">
        {t(locale, "category.edit")}:{" "}
        {pickLocalized(locale, {
          ru: category.titleRu,
          en: category.titleEn,
        })}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-text-1">
          {t(locale, "category.titleRu")}
          <input
            value={titleRu}
            onChange={(event) => setTitleRu(event.target.value)}
            onKeyDown={handleKeyDown}
            className="mt-1 w-full rounded-lg border border-glass-brd bg-bg-0 p-1.5 text-text-0"
          />
        </label>
        <label className="text-text-1">
          {t(locale, "category.titleEn")}
          <input
            value={titleEn}
            onChange={(event) => setTitleEn(event.target.value)}
            onKeyDown={handleKeyDown}
            className="mt-1 w-full rounded-lg border border-glass-brd bg-bg-0 p-1.5 text-text-0"
          />
        </label>
      </div>
      {error && <p className="mt-2 text-xs text-magenta">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => void submit()}
          className="rounded-lg bg-glass-brd/40 px-3 py-1.5 text-xs text-text-0 hover:bg-glass-brd/60 disabled:opacity-50"
        >
          {t(locale, "entry.save")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-glass-brd px-3 py-1.5 text-xs text-text-1 hover:text-text-0"
        >
          {t(locale, "entry.cancel")}
        </button>
      </div>
    </div>
  );
}
