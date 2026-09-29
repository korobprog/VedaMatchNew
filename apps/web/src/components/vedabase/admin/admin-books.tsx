"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AUDIENCE_STAGES,
  AUDIENCE_STAGE_LABELS,
  lineagesByGroup,
  type VedabaseAdminBook,
} from "@vedamatch/shared";
import {
  fetchVedabaseAdminBooks,
  updateVedabaseAdminBook,
} from "@/lib/vedabase-client-api";
import {
  bookPatch,
  draftOf,
  toggleIn,
  type AdminBookDraft,
} from "@/lib/vedabase/admin-book";
import { cn } from "@/lib/utils";

/**
 * Админка книг Библиотеки (VED-662, часть 3): для кого книга и каких линий —
 * это читает фильтр полки «Кто я / Линия», — название, автор и блокировка.
 * Заблокированная книга пропадает с полки, из читалки и поиска.
 */
export function AdminVedabaseBooks() {
  const [books, setBooks] = useState<VedabaseAdminBook[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetchVedabaseAdminBooks()
      .then(setBooks)
      .catch((loadError: unknown) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Не удалось загрузить книги",
        ),
      );
  }, []);

  const shown = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ru-RU");
    return (books ?? []).filter((book) =>
      `${book.title} ${book.author ?? ""} ${book.slug}`
        .toLocaleLowerCase("ru-RU")
        .includes(needle),
    );
  }, [books, query]);

  if (error)
    return (
      <p role="alert" className="mt-6 text-magenta">
        {error}
      </p>
    );
  if (!books) return <p className="mt-6 text-text-2">Загружаем книги…</p>;

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex-grow">
          <span className="sr-only">Поиск книги</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Название, автор или slug"
            className="min-h-11 w-full rounded-xl border border-glass-brd bg-bg-1 px-3 text-sm text-text-0"
          />
        </label>
        <span className="text-sm text-text-2">
          {books.length} книг · заблокировано{" "}
          {books.filter((book) => book.blocked).length}
        </span>
      </div>
      <ul className="flex flex-col gap-4">
        {shown.map((book) => (
          <li key={book.slug}>
            <BookEditor
              book={book}
              onSaved={(saved) =>
                setBooks((current) =>
                  (current ?? []).map((item) =>
                    item.slug === saved.slug ? saved : item,
                  ),
                )
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function BookEditor({
  book,
  onSaved,
}: {
  book: VedabaseAdminBook;
  onSaved(book: VedabaseAdminBook): void;
}) {
  const [draft, setDraft] = useState<AdminBookDraft>(() => draftOf(book));
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const patch = bookPatch(book, draft);
  const dirty = Object.keys(patch).length > 0;
  const id = `book-${book.slug}`;

  async function save() {
    if (!dirty || !draft.title.trim()) return;
    setPending(true);
    setStatus(null);
    try {
      const saved = await updateVedabaseAdminBook(book.slug, patch);
      onSaved(saved);
      setDraft(draftOf(saved));
      setStatus("Сохранено");
    } catch (saveError) {
      setStatus(
        saveError instanceof Error ? saveError.message : "Не удалось сохранить",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      aria-labelledby={`${id}-title`}
      className={cn(
        "glass flex flex-col gap-4 rounded-3xl border p-5",
        draft.blocked ? "border-magenta/60" : "border-glass-brd",
      )}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id={`${id}-title`}
          className="font-display text-lg font-bold text-text-0"
        >
          {book.title}
        </h2>
        <span className="font-mono text-xs text-text-2">
          {book.slug} · {book.chapterCount} гл.
          {book.active ? "" : " · текст не опубликован"}
        </span>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-text-1">
          Название
          <input
            value={draft.title}
            maxLength={200}
            onChange={(event) =>
              setDraft({ ...draft, title: event.target.value })
            }
            className="min-h-11 rounded-xl border border-glass-brd bg-bg-1 px-3 text-text-0"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-text-1">
          Автор
          <input
            value={draft.author ?? ""}
            maxLength={200}
            onChange={(event) =>
              setDraft({ ...draft, author: event.target.value })
            }
            className="min-h-11 rounded-xl border border-glass-brd bg-bg-1 px-3 text-text-0"
          />
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm text-text-1">
          Для кого{" "}
          <span className="text-text-2">— ничего не выбрано: для всех</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {AUDIENCE_STAGES.map((stage) => (
            <Chip
              key={stage}
              active={draft.audienceStages.includes(stage)}
              onClick={() =>
                setDraft({
                  ...draft,
                  audienceStages: toggleIn(draft.audienceStages, stage),
                })
              }
            >
              {AUDIENCE_STAGE_LABELS[stage]}
            </Chip>
          ))}
        </div>
      </fieldset>

      <details className="rounded-2xl border border-glass-brd px-4 py-3">
        <summary className="cursor-pointer text-sm text-text-1">
          Линии:{" "}
          <span className="text-text-0">
            {draft.lineages.length ? draft.lineages.join(", ") : "для всех"}
          </span>
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          {lineagesByGroup().map((group) => (
            <div key={group.group} className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-widest text-text-2">
                {group.label}
              </span>
              <div className="flex flex-wrap gap-2">
                {group.items.map((lineage) => (
                  <Chip
                    key={lineage.id}
                    active={draft.lineages.includes(lineage.id)}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        lineages: toggleIn(draft.lineages, lineage.id),
                      })
                    }
                  >
                    {lineage.label}
                  </Chip>
                ))}
              </div>
            </div>
          ))}
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-11 items-center gap-2 text-sm text-text-0">
          <input
            type="checkbox"
            checked={draft.blocked}
            onChange={(event) =>
              setDraft({ ...draft, blocked: event.target.checked })
            }
            className="size-5 accent-magenta"
          />
          Заблокировать книгу
        </label>
        <span className="text-xs text-text-2">
          Пропадёт с полки, из читалки и поиска.
        </span>
        <div className="ml-auto flex items-center gap-3">
          {status && (
            <span role="status" className="text-sm text-text-1">
              {status}
            </span>
          )}
          <button
            type="button"
            disabled={!dirty || pending || !draft.title.trim()}
            onClick={() => void save()}
            className="min-h-11 rounded-xl bg-gradient-to-r from-magenta to-[#B23EFF] px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Сохраняем…" : "Сохранить"}
          </button>
        </div>
      </div>
    </section>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-10 rounded-full border px-3 text-sm font-semibold",
        active
          ? "border-magenta bg-magenta/10 text-text-0"
          : "border-glass-brd text-text-1 hover:text-text-0",
      )}
    >
      {children}
    </button>
  );
}
