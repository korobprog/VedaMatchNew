"use client";

import type { MotivationBookDto, MotivationBookKind } from "@vedamatch/shared";
import { CollapsibleBlock } from "../collapsible-block";
import { useAdminCommand } from "./use-admin-command";
import { cardClass, fieldClass } from "./ui";

const kinds: ReadonlyArray<{ value: MotivationBookKind; label: string }> = [
  { value: "scripture", label: "Писание" },
  { value: "teaching", label: "Наставления" },
  { value: "biography", label: "Биография" },
  { value: "other", label: "Другое" },
];

const mined = new Set<MotivationBookKind>(["scripture", "teaching"]);

/**
 * Пометка книг: из чего можно добывать цитаты. Биографии исключены не ради
 * вкуса — в них повествование ведёт биограф, а в поле «автор» стоит герой
 * книги, и его словами оказывалась чужая проза.
 */
export function BookKindList({ books }: { books: MotivationBookDto[] }) {
  const { pending, errors, run } = useAdminCommand();

  return (
    <div className={cardClass}>
      <h2 className="text-lg font-semibold text-text-0">Книги для подбора цитат</h2>
      <p className="mt-1 text-sm text-text-2">
        Разбираются только «Писание» и «Наставления». Биографии пропускаются: там
        текст принадлежит биографу, а не тому, кто указан автором книги.
      </p>

      {books.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-glass-brd p-4 text-center text-sm text-text-2">
          В библиотеке нет книг с активной версией.
        </p>
      ) : (
        <div className="mt-4">
          <CollapsibleBlock
            title={`Список книг · ${books.length}`}
            preview={`${books.filter((book) => mined.has(book.kind)).length} участвуют в подборе`}
            defaultOpen={books.length <= 8}
          >
            <ul className="space-y-2">
              {books.map((book) => (
                <li
                  key={book.id}
                  className="flex flex-col gap-2 rounded-xl bg-glass p-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-text-0">{book.title}</p>
                    <p className="truncate text-xs text-text-2">
                      {[book.author, book.language].filter(Boolean).join(" · ")}
                      {!mined.has(book.kind) && " · не участвует в подборе"}
                    </p>
                  </div>
                  <label className="sm:w-52">
                    <span className="sr-only">{`Тип книги «${book.title}»`}</span>
                    <select
                      aria-label={`Тип книги «${book.title}»`}
                      value={book.kind}
                      disabled={pending[book.id] !== undefined}
                      onChange={(event) =>
                        run(book.id, "kind", {
                          path: `/admin/motivation/books/${book.id}`,
                          method: "PATCH",
                          body: { kind: event.target.value },
                        })
                      }
                      className={fieldClass}
                    >
                      {kinds.map((kind) => (
                        <option key={kind.value} value={kind.value}>
                          {kind.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {errors[book.id] && (
                    <p role="alert" className="text-sm font-medium text-red-500">
                      {errors[book.id]}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </CollapsibleBlock>
        </div>
      )}
    </div>
  );
}
