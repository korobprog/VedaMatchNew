// Браузерный клиент Вдохновения поверх общего apiFetch.
// Серверные запросы — в motivation-api.ts (там cookies из next/headers).
import { API_URL, apiFetch } from "@/lib/http-client";

/**
 * Глава Писания из Библиотеки — за санскритом стиха для «Читать полностью»
 * (VED-263). Вдохновение не хранит копию стиха и не читает таблицы
 * Библиотеки: оно спрашивает её публичный API, как любой клиент.
 *
 * Ответ главы неизменен (сервер отдаёт `immutable` с ETag), поэтому одна
 * глава запрашивается за сессию страницы один раз: соседние шлоки Гиты в ленте
 * обычно из одной главы. `null` — главы нет или запрос не удался: окно тогда
 * просто не покажет санскритских блоков. Неудача из кеша выбрасывается, чтобы
 * следующее открытие окна попробовало снова.
 */
const chapters = new Map<string, Promise<unknown | null>>();

export function fetchScriptureChapter(
  bookSlug: string,
  chapterSlug: string,
): Promise<unknown | null> {
  const key = `${bookSlug}/${chapterSlug}`;
  const cached = chapters.get(key);
  if (cached) return cached;
  const request = (async () => {
    try {
      const res = await apiFetch(
        `${API_URL}/vedabase/books/${encodeURIComponent(bookSlug)}/chapters/${encodeURIComponent(chapterSlug)}`,
      );
      if (!res.ok) return null;
      return (await res.json()) as unknown;
    } catch {
      return null;
    }
  })();
  chapters.set(key, request);
  void request.then((result) => {
    if (result === null) chapters.delete(key);
  });
  return request;
}

/** Для тестов: кеш модуля переживает рендеры и перетекал бы между ними. */
export function resetScriptureChapterCache(): void {
  chapters.clear();
}
