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
      setError(searchError instanceof Error ? searchError.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Search downloaded books" className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-zinc-900">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Search downloaded books</h2>
          <button type="button" onClick={onClose} aria-label="Close search">×</button>
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
            aria-label="Search query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
          />
          <button type="submit" disabled={searching || !query.trim()} className="rounded-xl bg-amber-600 px-4 py-2 text-white disabled:opacity-50">
            Search
          </button>
        </form>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyThisBook} onChange={(event) => setOnlyThisBook(event.target.checked)} />
          Search only this book
        </label>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        <div className="mt-4 space-y-2">
          {!searching && query.trim() && results.length === 0 && <p className="text-sm text-zinc-500">No local results</p>}
          {results.map((result) => (
            <button
              key={`${result.bookSlug}:${result.chapterSlug}:${result.unitId}`}
              type="button"
              onClick={() => onSelect(result)}
              className="block w-full rounded-xl border border-zinc-200 p-3 text-left hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
            >
              <span className="block text-xs text-zinc-500">{result.bookTitle} · {result.chapterTitle}</span>
              <strong className="mt-1 block">{result.unitTitle}</strong>
              <span className="mt-1 block text-sm text-zinc-600 dark:text-zinc-300">{result.snippet}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
