"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type {
  NoticeDto,
  NoticeKind,
  NoticeRubricDto,
} from "@vedamatch/shared";
import {
  NoticesApiError,
  getNoticeRubrics,
  getNoticesFeed,
} from "@/lib/notices-api";
import { NoticeCard } from "./notice-card";
import { NOTICE_KIND_CHIPS, NOTICE_KIND_ORDER } from "./notice-labels";

/** Лента доски: вид, рубрика, город и поиск. */
export function NoticesFeedView({ mine = false }: { mine?: boolean }) {
  const [rubrics, setRubrics] = useState<NoticeRubricDto[]>([]);
  const [items, setItems] = useState<NoticeDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [kind, setKind] = useState<NoticeKind | null>(null);
  const [rubric, setRubric] = useState<string | null>(null);
  const [city, setCity] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getNoticeRubrics()
      .then((response) => {
        if (alive) setRubrics(response.items);
      })
      .catch(() => {
        // Без рубрик лента всё равно работает — фильтр просто не покажется.
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      getNoticesFeed(
        {
          mine,
          kind: kind ?? undefined,
          rubric: rubric ?? undefined,
          city: city || undefined,
          q: query || undefined,
        },
        controller.signal,
      )
        .then((response) => {
          setItems(response.items);
          setNextCursor(response.nextCursor);
        })
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setError(
            e instanceof NoticesApiError
              ? e.message
              : "Не удалось загрузить доску",
          );
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [mine, kind, rubric, city, query]);

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const response = await getNoticesFeed({
        mine,
        kind: kind ?? undefined,
        rubric: rubric ?? undefined,
        city: city || undefined,
        q: query || undefined,
        cursor: nextCursor,
      });
      setItems((current) => [...current, ...response.items]);
      setNextCursor(response.nextCursor);
    } catch (e) {
      setError(e instanceof NoticesApiError ? e.message : "Не получилось");
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, mine, kind, rubric, city, query]);

  // Рубрики сужаются под выбранный вид: пустой `kinds` означает «во всех».
  const visibleRubrics = kind
    ? rubrics.filter((item) => !item.kinds.length || item.kinds.includes(kind))
    : rubrics;

  return (
    <div>
      <div className="glass mb-6 space-y-3 rounded-2xl border border-glass-brd p-4">
        <div className="flex flex-wrap gap-2">
          {NOTICE_KIND_ORDER.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={kind === option}
              onClick={() => {
                setKind(kind === option ? null : option);
                setRubric(null);
              }}
              className={`rounded-full border px-3 py-1 text-sm transition ${
                kind === option
                  ? "border-magenta/40 bg-magenta/10 text-text-0"
                  : "border-glass-brd text-text-1 hover:text-text-0"
              }`}
            >
              {NOTICE_KIND_CHIPS[option]}
            </button>
          ))}
        </div>

        {visibleRubrics.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {visibleRubrics.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={rubric === item.slug}
                onClick={() =>
                  setRubric(rubric === item.slug ? null : item.slug)
                }
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  rubric === item.slug
                    ? "border-magenta/40 bg-magenta/10 text-text-0"
                    : "border-glass-brd text-text-2 hover:text-text-0"
                }`}
              >
                {item.nameRu}
                {item.noticesCount > 0 && (
                  <span className="ml-1 text-text-2">{item.noticesCount}</span>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Что ищете"
            className="rounded-xl border border-glass-brd bg-transparent px-3 py-2 text-sm text-text-0 placeholder:text-text-2"
          />
          <input
            type="search"
            value={city}
            onChange={(event) => setCity(event.target.value)}
            placeholder="Город"
            className="rounded-xl border border-glass-brd bg-transparent px-3 py-2 text-sm text-text-0 placeholder:text-text-2"
          />
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-text-1">
          <Loader2 className="size-4 animate-spin" /> Загружаем…
        </p>
      ) : items.length === 0 ? (
        <div className="glass rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
          {mine ? (
            <p>
              Вы пока ничего не публиковали.{" "}
              <Link href="/notices/new" className="text-text-0 underline">
                Написать объявление
              </Link>
            </p>
          ) : (
            <p>
              По этим фильтрам пусто. Попробуйте снять часть из них или{" "}
              <Link href="/notices/new" className="text-text-0 underline">
                напишите своё
              </Link>
              .
            </p>
          )}
        </div>
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((notice) => (
              <li key={notice.id}>
                <NoticeCard notice={notice} />
              </li>
            ))}
          </ul>
          {nextCursor && (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="mt-6 w-full rounded-xl border border-glass-brd px-4 py-3 text-sm text-text-1 transition hover:text-text-0 disabled:opacity-50"
            >
              {loadingMore ? "Загружаем…" : "Показать ещё"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
