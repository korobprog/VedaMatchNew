import { useEffect, useState, type RefObject } from "react";
import type { VedabaseSelectionRange } from "@/lib/vedabase/locators";
import { selectionToRange } from "@/lib/vedabase/locators";

export interface ReaderAnnotationView {
  id: string;
  kind: "highlight" | "note";
  noteText: string | null;
  deletedAt: string | null;
}

export function AnnotationToolbar({
  readerRef,
  bookSlug,
  chapterSlug,
  annotations,
  onCreateHighlight,
  onCreateNote,
  onUpdateNote,
}: {
  readerRef: RefObject<HTMLDivElement | null>;
  bookSlug: string;
  chapterSlug: string;
  annotations: ReaderAnnotationView[];
  onCreateHighlight(selection: VedabaseSelectionRange): void;
  onCreateNote(selection: VedabaseSelectionRange, noteText: string): void;
  onUpdateNote(id: string, noteText: string): void;
}) {
  const [pendingRange, setPendingRange] = useState<VedabaseSelectionRange | null>(null);
  const [lastSelection, setLastSelection] = useState<VedabaseSelectionRange | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [selectionError, setSelectionError] = useState<string | null>(null);

  useEffect(() => {
    const capture = () => {
      const root = readerRef.current;
      const range = root
        ? selectionToRange(window.getSelection(), root, bookSlug, chapterSlug)
        : null;
      if (range) setLastSelection(range);
    };
    document.addEventListener("selectionchange", capture);
    return () => document.removeEventListener("selectionchange", capture);
  }, [bookSlug, chapterSlug, readerRef]);

  const currentSelection = () => {
    const root = readerRef.current;
    const range = root
      ? selectionToRange(window.getSelection(), root, bookSlug, chapterSlug)
      : null;
    const selected = range ?? lastSelection;
    setSelectionError(selected ? null : "Select text inside one reader block first");
    return selected;
  };

  const saveNote = () => {
    const value = noteText.trim();
    if (!value) return;
    if (editingId) onUpdateNote(editingId, value);
    else if (pendingRange) onCreateNote(pendingRange, value);
    setEditingId(null);
    setPendingRange(null);
    setNoteText("");
  };

  return (
    <aside className="reader-surface rounded-2xl border p-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            const range = currentSelection();
            if (range) onCreateHighlight(range);
          }}
          className="reader-mark rounded-lg px-3 py-2 text-sm"
        >
          Highlight selection
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            const range = currentSelection();
            if (range) {
              setEditingId(null);
              setPendingRange(range);
              setNoteText("");
            }
          }}
          className="reader-subtle rounded-lg px-3 py-2 text-sm"
        >
          Add note to selection
        </button>
      </div>
      {selectionError && <p role="alert" className="reader-danger mt-2 text-sm">{selectionError}</p>}
      {(pendingRange || editingId) && (
        <div className="mt-3 space-y-2">
          <textarea
            aria-label="Note text"
            value={noteText}
            maxLength={20_000}
            onChange={(event) => setNoteText(event.target.value)}
            className="reader-field min-h-24 w-full rounded-xl border p-3"
          />
          <button type="button" onClick={saveNote} disabled={!noteText.trim()} className="rounded-lg bg-amber-600 px-3 py-2 text-sm text-white disabled:opacity-50">
            Save note
          </button>
        </div>
      )}
      <ul className="mt-4 space-y-2">
        {annotations
          .filter((annotation) => annotation.kind === "note" && !annotation.deletedAt && annotation.noteText)
          .map((annotation) => (
            <li key={annotation.id} className="reader-subtle flex items-center justify-between gap-3 rounded-xl p-3 text-sm">
              <span>{annotation.noteText}</span>
              <button
                type="button"
                aria-label={`Edit ${annotation.noteText}`}
                onClick={() => {
                  setPendingRange(null);
                  setEditingId(annotation.id);
                  setNoteText(annotation.noteText ?? "");
                }}
              >
                Edit
              </button>
            </li>
          ))}
      </ul>
    </aside>
  );
}
