"use client";

import { useEffect, useState, type RefObject } from "react";
import { Clapperboard, Copy, Highlighter, StickyNote } from "lucide-react";
import type { VedabaseSelectionRange } from "@/lib/vedabase/locators";
import { selectionToRange } from "@/lib/vedabase/locators";
import { copyText } from "@/lib/copy-text";

/**
 * Ссылка в мастер «Свой рилс» с выделенным фрагментом. Связь с сервисом
 * мотивации — только через URL: компоненты чужого сервиса не импортируются,
 * а сервер сам сверит текст с главой по книге и главе.
 */
export function reelLinkFor(input: { bookSlug: string; chapterSlug: string; text: string }): string {
  const query = new URLSearchParams({
    from: "vedabase",
    book: input.bookSlug,
    chapter: input.chapterSlug,
    text: input.text.trim(),
  });
  return `/motivation/create?${query.toString()}`;
}

const MAX_REEL_TEXT = 600;

/**
 * Панель выделенного текста (VED-662): появляется над листанием, пока в
 * главе что-то выделено, — «Копировать», «Выделить», «Заметка», «Рилс».
 * Кнопки не забирают фокус на нажатии (`preventDefault` на mousedown),
 * иначе выделение пропало бы раньше, чем его успели сохранить.
 */
export function AnnotationToolbar({
  readerRef,
  bookSlug,
  chapterSlug,
  onCreateHighlight,
  onCreateNote,
}: {
  readerRef: RefObject<HTMLDivElement | null>;
  bookSlug: string;
  chapterSlug: string;
  onCreateHighlight(selection: VedabaseSelectionRange): void;
  /** Отклонённый промис — заметка не записалась: форма остаётся с текстом. */
  onCreateNote(selection: VedabaseSelectionRange, noteText: string): Promise<void>;
}) {
  const [selection, setSelection] = useState<{
    range: VedabaseSelectionRange;
    text: string;
  } | null>(null);
  const [noteRange, setNoteRange] = useState<VedabaseSelectionRange | null>(null);
  const [noteText, setNoteText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [noteFailed, setNoteFailed] = useState(false);

  useEffect(() => {
    const capture = () => {
      const root = readerRef.current;
      const current = window.getSelection();
      const range = root
        ? selectionToRange(current, root, bookSlug, chapterSlug)
        : null;
      if (range) {
        setSelection({ range, text: current?.toString() ?? "" });
        setStatus(null);
      } else if (current?.isCollapsed) {
        setSelection(null);
      }
    };
    document.addEventListener("selectionchange", capture);
    return () => document.removeEventListener("selectionchange", capture);
  }, [bookSlug, chapterSlug, readerRef]);

  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), 2000);
    return () => clearTimeout(timer);
  }, [status]);

  const done = () => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  };

  // Форму закрываем и «сохранена» говорим только после записи: раньше текст
  // стирался сразу, и при сбое хранилища человек терял написанное, успев
  // увидеть подтверждение.
  const saveNote = async () => {
    const value = noteText.trim();
    if (!value || !noteRange || saving) return;
    setSaving(true);
    setNoteFailed(false);
    try {
      await onCreateNote(noteRange, value);
      setNoteRange(null);
      setNoteText("");
      setStatus("Заметка сохранена");
    } catch {
      setNoteFailed(true);
    } finally {
      setSaving(false);
    }
  };

  if (noteRange) {
    return (
      <div className="reader-surface fixed inset-x-3 bottom-24 z-30 mx-auto max-w-lg rounded-2xl border p-4 shadow-2xl">
        <p className="reader-muted line-clamp-2 text-sm italic">
          «{noteRange.range.quote}»
        </p>
        <textarea
          aria-label="Текст заметки"
          value={noteText}
          maxLength={20_000}
          autoFocus
          onChange={(event) => setNoteText(event.target.value)}
          className="reader-field mt-3 min-h-24 w-full rounded-xl border p-3 text-base"
        />
        {noteFailed && (
          <p role="alert" className="reader-danger mt-2 text-sm">
            Заметка не сохранилась. Текст на месте — попробуйте ещё раз.
          </p>
        )}
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setNoteRange(null);
              setNoteText("");
              setNoteFailed(false);
            }}
            className="reader-hover min-h-11 rounded-xl px-4 text-sm"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => void saveNote()}
            disabled={!noteText.trim() || saving}
            className="min-h-11 rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            Сохранить заметку
          </button>
        </div>
      </div>
    );
  }

  if (!selection) {
    return status ? (
      <p
        role="status"
        className="reader-surface fixed inset-x-3 bottom-24 z-30 mx-auto w-fit rounded-xl border px-4 py-2 text-sm shadow-lg"
      >
        {status}
      </p>
    ) : null;
  }

  const action =
    "reader-hover flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-xs font-semibold sm:flex-row sm:gap-1.5 sm:px-3 sm:text-sm";
  return (
    <div
      role="toolbar"
      aria-label="Выделенный текст"
      className="reader-surface fixed inset-x-3 bottom-24 z-30 mx-auto flex max-w-lg gap-1 rounded-2xl border p-1.5 shadow-2xl"
    >
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          void copyText(selection.text.trim()).then((ok) =>
            setStatus(ok ? "Скопировано" : "Не скопировалось"),
          );
          done();
        }}
        className={action}
      >
        <Copy aria-hidden className="size-4" />
        <span className="max-[400px]:text-xs">Копировать</span>
      </button>
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          onCreateHighlight(selection.range);
          done();
        }}
        className={action}
      >
        <Highlighter aria-hidden className="size-4" />
        <span className="max-[400px]:text-xs">Выделить</span>
      </button>
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          setNoteRange(selection.range);
          setNoteText("");
          setNoteFailed(false);
          done();
        }}
        className={action}
      >
        <StickyNote aria-hidden className="size-4" />
        <span className="max-[400px]:text-xs">Заметка</span>
      </button>
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          const text = selection.text.trim();
          if (text.length > MAX_REEL_TEXT) {
            setStatus(`Для рилса выделите фрагмент короче ${MAX_REEL_TEXT} символов`);
            return;
          }
          // Переход обычной навигацией: мастер живёт в другом сервисе, а
          // читалка работает и офлайн без app-router-контекста.
          window.location.assign(reelLinkFor({ bookSlug, chapterSlug, text }));
        }}
        className={action}
      >
        <Clapperboard aria-hidden className="size-4" />
        <span className="max-[400px]:text-xs">Рилс</span>
      </button>
    </div>
  );
}
