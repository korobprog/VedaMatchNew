"use client";

import { useState } from "react";

export interface ReaderPanelNote {
  id: string;
  kind: "highlight" | "note";
  chapterSlug: string;
  unitId: string;
  quote: string;
  noteText: string | null;
}

export interface ReaderPanelBookmark {
  id: string;
  chapterSlug: string;
  unitId: string;
}

type Tab = "notes" | "highlights" | "bookmarks";

const TABS: Array<{ value: Tab; label: string }> = [
  { value: "notes", label: "Заметки" },
  { value: "highlights", label: "Выделения" },
  { value: "bookmarks", label: "Закладки" },
];

/**
 * Правая панель читалки (VED-662): заметки, выделения и закладки этой
 * книги. Нажатие ведёт к стиху; заметку можно поправить прямо здесь.
 */
export function ReaderNotesPanel({
  notes,
  bookmarks,
  chapterTitle,
  unitTitle,
  onJump,
  onUpdateNote,
}: {
  notes: ReaderPanelNote[];
  bookmarks: ReaderPanelBookmark[];
  /** Название главы по slug — подпись у записи. */
  chapterTitle(chapterSlug: string): string;
  /** Название стиха, если он в открытой главе. */
  unitTitle(chapterSlug: string, unitId: string): string | null;
  onJump(chapterSlug: string, unitId: string): void;
  /** Отклонённый промис — правка не записалась: поле остаётся с текстом. */
  onUpdateNote(id: string, noteText: string): Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>("notes");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  // Поле закрываем только после записи, иначе при сбое правка терялась.
  const save = async (id: string, text: string) => {
    if (saving) return;
    setSaving(true);
    setFailed(false);
    try {
      await onUpdateNote(id, text);
      setEditing(null);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const where = (chapterSlug: string, unitId: string) =>
    [chapterTitle(chapterSlug), unitTitle(chapterSlug, unitId)]
      .filter(Boolean)
      .join(" · ");

  const shown =
    tab === "notes"
      ? notes.filter((note) => note.kind === "note")
      : notes.filter((note) => note.kind === "highlight");

  return (
    <div className="flex flex-col gap-3">
      <div
        role="tablist"
        aria-label="Мои записи"
        className="reader-subtle grid grid-cols-3 gap-1 rounded-xl p-1"
      >
        {TABS.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={tab === item.value}
            onClick={() => setTab(item.value)}
            className="min-h-10 rounded-lg text-sm font-semibold aria-selected:bg-[var(--reader-surface)] aria-selected:shadow-sm"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="flex flex-col gap-2">
        {tab === "bookmarks" ? (
          bookmarks.length === 0 ? (
            <Empty>Закладок нет. Значок закладки — в верхней панели.</Empty>
          ) : (
            bookmarks.map((mark) => (
              <button
                key={mark.id}
                type="button"
                onClick={() => onJump(mark.chapterSlug, mark.unitId)}
                className="reader-subtle reader-hover rounded-xl px-3 py-2.5 text-left text-sm"
              >
                {where(mark.chapterSlug, mark.unitId)}
              </button>
            ))
          )
        ) : shown.length === 0 ? (
          <Empty>
            {tab === "notes"
              ? "Заметок нет. Выделите текст и нажмите «Заметка»."
              : "Выделений нет. Выделите текст и нажмите «Выделить»."}
          </Empty>
        ) : (
          shown.map((note) => (
            <div
              key={note.id}
              className="reader-subtle flex flex-col gap-1.5 rounded-xl px-3 py-2.5"
            >
              <button
                type="button"
                onClick={() => onJump(note.chapterSlug, note.unitId)}
                className="flex flex-col gap-1 text-left"
              >
                <span className="reader-muted text-xs">
                  {where(note.chapterSlug, note.unitId)}
                </span>
                <span className="line-clamp-3 text-sm italic">
                  «{note.quote}»
                </span>
              </button>
              {note.kind === "note" &&
                (editing?.id === note.id ? (
                  <div className="flex flex-col gap-2">
                    <textarea
                      aria-label="Текст заметки"
                      value={editing.text}
                      maxLength={20_000}
                      autoFocus
                      onChange={(event) =>
                        setEditing({ id: note.id, text: event.target.value })
                      }
                      className="reader-field min-h-20 w-full rounded-lg border p-2 text-sm"
                    />
                    {failed && (
                      <p role="alert" className="reader-danger text-sm">
                        Заметка не сохранилась. Текст на месте — попробуйте
                        ещё раз.
                      </p>
                    )}
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(null);
                          setFailed(false);
                        }}
                        className="reader-hover min-h-10 rounded-lg px-3 text-sm"
                      >
                        Отмена
                      </button>
                      <button
                        type="button"
                        disabled={!editing.text.trim() || saving}
                        onClick={() =>
                          void save(note.id, editing.text.trim())
                        }
                        className="min-h-10 rounded-lg bg-gradient-to-r from-magenta to-[#B23EFF] px-3 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        Сохранить заметку
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm">{note.noteText}</p>
                    <button
                      type="button"
                      aria-label={`Изменить заметку: ${note.noteText ?? ""}`}
                      onClick={() => {
                        setFailed(false);
                        setEditing({ id: note.id, text: note.noteText ?? "" });
                      }}
                      className="reader-accent reader-hover min-h-9 shrink-0 rounded-lg px-2 text-xs font-semibold"
                    >
                      Изменить
                    </button>
                  </div>
                ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="reader-muted px-1 text-sm">{children}</p>;
}
