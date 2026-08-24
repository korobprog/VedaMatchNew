"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LibraryLocale, LibrarySectionDto } from "@vedamatch/shared";
import { Pencil, Trash2 } from "lucide-react";
import { t } from "./i18n";
import { apiFetch } from "@/lib/http-client";

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
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!section.canEdit) return null;

  async function remove() {
    setDeleteError(null);
    setDeletePending(true);
    try {
      const res = await apiFetch(`${API_URL}/library/sections/${section.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      // 404 — раздела уже нет: для админа это тот же успешный итог.
      if (!res.ok && res.status !== 404) {
        const body = (await res.json().catch(() => null)) as
          | { message?: string }
          | null;
        setDeleteError(
          body?.message === "section_not_empty"
            ? t(locale, "section.deleteNotEmpty")
            : t(locale, "section.deleteFailed"),
        );
        return;
      }
      close();
      router.refresh();
    } catch {
      setDeleteError(t(locale, "section.deleteFailed"));
    } finally {
      setDeletePending(false);
    }
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
      const res = await apiFetch(`${API_URL}/library/sections/${section.id}`, {
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
      close();
      router.refresh();
    } catch {
      setError(t(locale, "add.failed"));
    } finally {
      setPending(false);
    }
  }

  const titleId = `section-edit-title-${section.id}`;

  function close() {
    setOpen(false);
    setDeleteConfirming(false);
    setDeleteError(null);
  }

  return (
    <>
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

      {open && (
        // Модалка по центру экрана, а не попап у иконки: на мобильном сетка
        // в две колонки узкая, и попап шириной с форму раньше вылезал за
        // край экрана у крайних карточек.
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={close}
        >
          <form
            onSubmit={submit}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-glass-brd bg-bg-1 p-4 text-sm shadow-xl"
          >
            <p id={titleId} className="mb-2 text-text-2">
              {t(locale, "section.edit")}
            </p>
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
                  close();
                }}
                className="rounded-lg border border-glass-brd px-3 py-1.5 text-xs text-text-1 hover:text-text-0"
              >
                {t(locale, "entry.cancel")}
              </button>
            </div>

            <div className="mt-3 border-t border-glass-brd pt-3">
              {!deleteConfirming ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    setDeleteConfirming(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg px-1 text-xs text-text-2 hover:text-magenta"
                >
                  <Trash2 aria-hidden className="h-3.5 w-3.5" />
                  {t(locale, "section.delete")}
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-text-1">
                    {t(locale, "section.deleteConfirm")}
                  </span>
                  <button
                    type="button"
                    disabled={deletePending}
                    onClick={(event) => {
                      event.preventDefault();
                      void remove();
                    }}
                    className="rounded-lg border border-magenta/40 px-3 py-1.5 text-xs text-magenta hover:bg-magenta/10 disabled:opacity-50"
                  >
                    {deletePending
                      ? t(locale, "section.deleting")
                      : t(locale, "section.deleteConfirmYes")}
                  </button>
                  <button
                    type="button"
                    disabled={deletePending}
                    onClick={(event) => {
                      event.preventDefault();
                      setDeleteConfirming(false);
                    }}
                    className="rounded-lg px-3 py-1.5 text-xs text-text-2 hover:text-text-0 disabled:opacity-50"
                  >
                    {t(locale, "entry.cancel")}
                  </button>
                </div>
              )}
              {deleteError && (
                <p className="mt-2 text-xs text-magenta">{deleteError}</p>
              )}
            </div>
          </form>
        </div>
      )}
    </>
  );
}
