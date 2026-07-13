"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  MotivationAuthorWatchDto,
  MotivationSourceWatchDto,
} from "@vedamatch/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function apiRequest(path: string, method: string, body?: unknown) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error((await response.text()) || `Ошибка API ${response.status}`);
  return response.status === 204 ? null : response.json();
}

function formatDate(value: string | null): string {
  if (!value) return "ещё не запускался";
  return new Date(value).toLocaleString("ru-RU");
}

function AuthorWatchList({ authors }: { authors: MotivationAuthorWatchDto[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, setPending] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [results, setResults] = useState<Record<string, number>>({});

  async function addAuthor() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setPending("add");
    setError(undefined);
    try {
      await apiRequest("/admin/motivation/authors", "POST", { name: trimmed });
      setName("");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось добавить автора");
    } finally {
      setPending(undefined);
    }
  }

  async function searchNow(id: string) {
    setPending(id);
    setError(undefined);
    try {
      const result = (await apiRequest(`/admin/motivation/authors/${id}/search`, "POST")) as { foundCount: number };
      setResults((current) => ({ ...current, [id]: result.foundCount }));
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось запустить поиск");
    } finally {
      setPending(undefined);
    }
  }

  async function remove(id: string) {
    setPending(id);
    setError(undefined);
    try {
      await apiRequest(`/admin/motivation/authors/${id}`, "DELETE");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось удалить автора");
    } finally {
      setPending(undefined);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Авторы для поиска</h3>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        ИИ ищет цитаты автора сначала во внутренней библиотеке VedaMatch, затем — в одобренных веб-источниках.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Имя автора, например: Шрила Прабхупада"
          aria-label="Имя автора"
          className="min-w-[240px] flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
        <button
          type="button"
          disabled={pending === "add" || !name.trim()}
          onClick={addAuthor}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending === "add" ? "Добавление…" : "Добавить"}
        </button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm font-medium text-red-700 dark:text-red-300">{error}</p>}
      <ul className="mt-4 space-y-2">
        {authors.length === 0 && (
          <li className="rounded-xl border border-dashed border-zinc-300 p-4 text-center text-sm text-zinc-500 dark:border-zinc-700">
            Список авторов пуст.
          </li>
        )}
        {authors.map((author) => (
          <li key={author.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-950">
            <div>
              <p className="font-medium text-zinc-900 dark:text-zinc-100">{author.name}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Последний поиск: {formatDate(author.lastSearchedAt)} · найдено {results[author.id] ?? author.lastResultCount}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending === author.id}
                onClick={() => searchNow(author.id)}
                className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {pending === author.id ? "Поиск…" : "Искать сейчас"}
              </button>
              <button
                type="button"
                disabled={pending === author.id}
                onClick={() => remove(author.id)}
                className="rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-700 disabled:opacity-50 dark:border-red-900 dark:text-red-300"
              >
                Удалить
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SourceWatchList({ sources }: { sources: MotivationSourceWatchDto[] }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [pending, setPending] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [results, setResults] = useState<Record<string, number>>({});

  async function addSource() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setPending("add");
    setError(undefined);
    try {
      await apiRequest("/admin/motivation/sources", "POST", { url: trimmed, label: label.trim() || undefined });
      setUrl("");
      setLabel("");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось добавить источник");
    } finally {
      setPending(undefined);
    }
  }

  async function searchNow(id: string) {
    setPending(id);
    setError(undefined);
    try {
      const result = (await apiRequest(`/admin/motivation/sources/${id}/search`, "POST")) as { foundCount: number };
      setResults((current) => ({ ...current, [id]: result.foundCount }));
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось запустить поиск");
    } finally {
      setPending(undefined);
    }
  }

  async function remove(id: string) {
    setPending(id);
    setError(undefined);
    try {
      await apiRequest(`/admin/motivation/sources/${id}`, "DELETE");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось удалить источник");
    } finally {
      setPending(undefined);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Источники (ссылки)</h3>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        ИИ извлекает только текст, реально присутствующий на странице, ничего не сочиняя.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <input
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://..."
          aria-label="Ссылка на источник"
          className="min-w-[240px] flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
        <input
          type="text"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Название (необязательно)"
          aria-label="Название источника"
          className="min-w-[160px] rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
        <button
          type="button"
          disabled={pending === "add" || !url.trim()}
          onClick={addSource}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending === "add" ? "Добавление…" : "Добавить"}
        </button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm font-medium text-red-700 dark:text-red-300">{error}</p>}
      <ul className="mt-4 space-y-2">
        {sources.length === 0 && (
          <li className="rounded-xl border border-dashed border-zinc-300 p-4 text-center text-sm text-zinc-500 dark:border-zinc-700">
            Список источников пуст.
          </li>
        )}
        {sources.map((source) => (
          <li key={source.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-950">
            <div className="min-w-0">
              <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">{source.label || source.url}</p>
              <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{source.url}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Последний запуск: {formatDate(source.lastFetchedAt)} · найдено {results[source.id] ?? source.lastResultCount}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                disabled={pending === source.id}
                onClick={() => searchNow(source.id)}
                className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {pending === source.id ? "Поиск…" : "Искать сейчас"}
              </button>
              <button
                type="button"
                disabled={pending === source.id}
                onClick={() => remove(source.id)}
                className="rounded-lg border border-red-300 px-3 py-2 text-xs font-medium text-red-700 disabled:opacity-50 dark:border-red-900 dark:text-red-300"
              >
                Удалить
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MotivationAdminWatchlists({
  authors,
  sources,
}: {
  authors: MotivationAuthorWatchDto[] | null;
  sources: MotivationSourceWatchDto[] | null;
}) {
  return (
    <section aria-labelledby="watchlists-heading" className="mt-8">
      <h2 id="watchlists-heading" className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        Поиск цитат
      </h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Найденные цитаты попадают в очередь «Цитаты и текст» ниже и требуют обычного одобрения.
      </p>
      <div className="mt-4">
        <AuthorWatchList authors={authors ?? []} />
        <SourceWatchList sources={sources ?? []} />
      </div>
    </section>
  );
}
