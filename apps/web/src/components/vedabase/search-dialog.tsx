import { useState } from "react";
import {
  searchDownloadedBooks,
  type VedabaseSearchResult,
} from "@/lib/vedabase/search-index";

export function SearchDialog({
  open,
  userId,
  bookSlug,
  onClose,
  onSelect,
}: {
  open: boolean;
  userId: string;
  bookSlug: string;
  onClose(): void;
  onSelect(result: VedabaseSearchResult): void;
}) {
  const [query, setQuery] = useState("");
  const [onlyThisBook, setOnlyThisBook] = useState(false);
  const [results, setResults] = useState<VedabaseSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) return null;

  const runSearch = async () => {
    setSearching(true);
    setError(null);
    try {
      setResults(
        await searchDownloadedBooks(userId, query, {
          bookSlug: onlyThisBook ? bookSlug : undefined,
        }),
      );
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Не удалось выполнить поиск");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Поиск по скачанным книгам" className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="reader-surface max-h-[80vh] w-full max-w-2xl overflow-auto rounded-2xl border p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Поиск по скачанным книгам</h2>
          <button type="button" onClick={onClose} aria-label="Закрыть поиск">×</button>
        </div>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void runSearch();
          }}
        >
          <input
            type="search"
            aria-label="Поисковый запрос"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="reader-field min-w-0 flex-1 rounded-xl border px-3 py-2"
          />
          <button type="submit" disabled={searching || !query.trim()} className="rounded-xl bg-amber-600 px-4 py-2 text-white disabled:opacity-50">
            Найти
          </button>
        </form>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyThisBook} onChange={(event) => setOnlyThisBook(event.target.checked)} />
          Искать только в этой книге
        </label>
        {error && <p role="alert" className="reader-danger mt-3 text-sm">{error}</p>}
        <div className="mt-4 space-y-2">
          {!searching && query.trim() && results.length === 0 && <p className="reader-muted text-sm">No local results</p>}
          {results.map((result) => (
            <button
              key={`${result.bookSlug}:${result.chapterSlug}:${result.unitId}`}
              type="button"
              onClick={() => onSelect(result)}
              className="reader-bordered reader-hover block w-full rounded-xl border p-3 text-left transition-colors"
            >
              <span className="reader-muted block text-xs">{result.bookTitle} · {result.chapterTitle}</span>
              <strong className="mt-1 block">{result.unitTitle}</strong>
              <span className="reader-muted mt-1 block text-sm">{result.snippet}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
