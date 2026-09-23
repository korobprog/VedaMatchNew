"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BookmarkPlus, Loader2, Trash2, Zap } from "lucide-react";
import type { BookmarkDto } from "@vedamatch/shared";
import {
  addBookmark,
  listBookmarks,
  removeBookmark,
} from "@/lib/bookmarks-api";
import { isAbort } from "@/lib/is-abort";
import { useServiceNames } from "@/components/service-catalog-provider";
import { bookmarkServiceLabel, bookmarkTitleFrom } from "./bookmark-title";

/**
 * Список закладок и кнопка «положить сюда текущую страницу» (VED-163).
 *
 * Одна шторка на весь портал вместо звёздочки на каждой странице: закладка
 * нужна на любом уровне любого сервиса — на исполнителе в Музыке, на доске в
 * Работе, на книге в Образовании, — и сорок сервисных кнопок пришлось бы
 * заводить и поддерживать по одной. Адрес и заголовок вкладки браузер знает
 * сам, поэтому страницы ради закладок ничего не объявляют.
 */
/*
 * Мелкие подписи здесь идут `--vm-text-1`, а не `--vm-text-2`: шторка лежит
 * на `--vm-bg-1`, где второй текстовый токен даёт 4,29:1 в тёмной теме —
 * ниже AA. Разбор замера — в шапке `components/quick/quick-panel.tsx`.
 */
export function BookmarksSheet({
  onClose,
  onNavigate,
  onPin,
  pinned,
}: {
  onClose: () => void;
  /** Переход по закладке закрывает и шторку, и саму панель. */
  onNavigate: () => void;
  /**
   * Сделать из закладки горячую кнопку (VED-345). Закладок со временем
   * десятки, а под рукой нужны две-три — панель их и держит.
   */
  onPin?: (item: BookmarkDto) => void;
  /** Эта закладка уже стоит в панели. */
  pinned?: (path: string) => boolean;
}) {
  const names = useServiceNames();
  const [items, setItems] = useState<BookmarkDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /* Текущая страница снимается один раз, при открытии шторки: адрес и
     заголовок знает только браузер, а `useSearchParams` в шапке перевёл бы в
     клиентскую отрисовку каждую страницу, где есть шапка. Ленивым
     начальным значением, а не эффектом: шторка рисуется только по нажатию,
     то есть уже в браузере, и лишнего каскада рендеров не нужно. */
  const [here] = useState<{ path: string; title: string } | null>(() => {
    if (typeof window === "undefined") return null;
    const path = `${window.location.pathname}${window.location.search}`;
    return { path, title: bookmarkTitleFrom(document.title, path) };
  });

  useEffect(() => {
    const controller = new AbortController();
    listBookmarks(controller.signal)
      .then((response) => setItems(response.items))
      .catch((cause) => {
        if (isAbort(cause)) return;
        setItems([]);
        setError("Не удалось загрузить закладки.");
      });
    return () => controller.abort();
  }, []);

  const saved = here
    ? (items ?? []).find((item) => item.path === here.path)
    : undefined;

  const toggleHere = useCallback(async () => {
    if (!here || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (saved) {
        await removeBookmark(saved.id);
        setItems((list) =>
          (list ?? []).filter((item) => item.id !== saved.id),
        );
      } else {
        const created = await addBookmark({
          path: here.path,
          title: here.title,
        });
        setItems((list) => [
          created,
          ...(list ?? []).filter((item) => item.id !== created.id),
        ]);
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Не вышло. Попробуйте ещё раз.",
      );
    } finally {
      setBusy(false);
    }
  }, [busy, here, saved]);

  const drop = useCallback(async (item: BookmarkDto) => {
    setError(null);
    try {
      await removeBookmark(item.id);
      setItems((list) => (list ?? []).filter((row) => row.id !== item.id));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Не вышло удалить закладку.",
      );
    }
  }, []);

  return (
    <div className="mt-3 rounded-xl border border-glass-brd bg-bg-1 p-3 text-sm text-text-1">
      {/* Название страницы — в самой кнопке, справа от действия (VED-399):
          отдельной строкой под кнопкой оно съедало высоту целой закладки,
          и на телефоне третья закладка уходила за край. Какую страницу
          кнопка добавит или уберёт, видно там же, где на неё нажимают. */}
      <button
        type="button"
        onClick={() => void toggleHere()}
        disabled={!here || busy || items === null}
        title={here?.title}
        className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-glass-brd px-3 py-2 text-left text-sm text-text-0 transition-colors hover:bg-white/4 disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="size-4 shrink-0 motion-safe:animate-spin" />
        ) : (
          <BookmarkPlus className="size-4 shrink-0" />
        )}
        <span className="shrink-0">
          {saved ? "Убрать эту страницу" : "Добавить эту страницу"}
        </span>
        {here && (
          <span className="ml-auto min-w-0 truncate text-[11px] text-text-1">
            {/* Для скринридера — отдельной фразой, а не слитно с действием. */}
            <span className="sr-only">: </span>
            {here.title}
          </span>
        )}
      </button>

      {/* Цветом только рамка: `--vm-magenta` на светлой теме даёт 4.46:1 и
          мелким текстом запрещён (см. «Дизайн-система» в CLAUDE.md), а
          ошибку человек обязан прочитать. */}
      {error && (
        <p
          role="alert"
          className="mt-2 rounded-lg border border-magenta/50 px-2 py-1.5 text-xs text-text-0"
        >
          {error}
        </p>
      )}

      {/* Своей прокрутки у списка нет: листается вся панель (VED-399).
          Вложенная прокрутка с потолком в полэкрана внутри панели, которая
          сама не листалась, и прятала третью закладку. */}
      <div className="mt-3">
        {items === null ? (
          <p className="px-1 py-2 text-xs text-text-1">Загружаем…</p>
        ) : items.length === 0 ? (
          <p className="px-1 py-2 text-xs text-text-1">
            Пока пусто. Откройте нужную страницу — исполнителя, доску, книгу —
            и нажмите «Добавить эту страницу».
          </p>
        ) : (
          /* Одна строка на закладку: сначала её имя, потом раздел (VED-326).
             Заголовками разделов список распадался на полтора десятка
             однострочных групп, и на телефоне в шторку помещалось три
             закладки из десяти. */
          <ul className="space-y-0.5">
            {items.map((item) => {
              const service = bookmarkServiceLabel(item.service, names);
              const here = pinned?.(item.path) ?? false;
              return (
                <li key={item.id} className="flex items-center gap-1">
                  <Link
                    href={item.path}
                    onClick={onNavigate}
                    title={`${item.title} — ${service}`}
                    className="flex min-h-11 min-w-0 flex-1 items-baseline gap-1.5 rounded-lg px-2 py-1.5 text-sm text-text-1 transition-colors hover:bg-white/4 hover:text-text-0"
                  >
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    <span className="shrink-0 text-[11px] text-text-1">
                      {service}
                    </span>
                  </Link>
                  {onPin && (
                    <button
                      type="button"
                      onClick={() => onPin(item)}
                      disabled={here}
                      aria-label={
                        here
                          ? `Уже в панели горячих клавиш: ${item.title}`
                          : `Создать горячую клавишу: ${item.title}`
                      }
                      title={
                        here
                          ? "Уже в панели горячих клавиш"
                          : "Создать горячую клавишу"
                      }
                      className={`flex size-11 shrink-0 items-center justify-center rounded-full transition-colors ${
                        here
                          ? "text-mint-edge"
                          : "text-text-2 hover:text-text-0"
                      }`}
                    >
                      <Zap className="size-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void drop(item)}
                    aria-label={`Удалить закладку: ${item.title}`}
                    className="flex size-11 shrink-0 items-center justify-center rounded-full text-text-2 transition-colors hover:text-text-0"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={onClose}
        className="mt-3 rounded-lg border border-glass-brd px-3 py-1.5 text-xs text-text-1 transition-colors hover:text-text-0"
      >
        Закрыть
      </button>
    </div>
  );
}
