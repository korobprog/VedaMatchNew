"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import { getFavoriteIds, setTrackFavorite } from "@/lib/music-playback-api";

/**
 * Что человек отметил сердцем — на весь раздел Музыки сразу.
 *
 * Один список на страницу, а не признак в каждой карточке: карточку каталога
 * видит и гость, ответ витрины общий на всех, и поле «в моём избранном»
 * внутри него сделало бы его персональным. Список короткий — потолок
 * избранного двести записей.
 *
 * Переключение оптимистичное и откатывается на отказе: сердце должно
 * отзываться мгновенно, но показывать «отмечено» там, где на сервере пусто,
 * нельзя — человек не найдёт запись в своём избранном.
 */
interface FavoritesApi {
  has(trackId: string): boolean;
  toggle(trackId: string): void;
  /** Пока не ответил сервер, сердец нет вовсе — а не «все пустые». */
  ready: boolean;
}

const FavoritesContext = createContext<FavoritesApi | null>(null);

export function useMusicFavorites(): FavoritesApi | null {
  return useContext(FavoritesContext);
}

export function MusicFavoritesProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getFavoriteIds().then((result) => {
      if (cancelled) return;
      // Гостю приходит `null`: сердец у него нет и быть не может, но
      // «готово» ставим всё равно — иначе карточки ждали бы вечно.
      if (result) setIds(new Set(result.ids));
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Запрос идёт **вне** обновления состояния.
   *
   * Внутри `setIds` он посылался бы дважды: React вызывает обновляющую
   * функцию повторно (в разработке — намеренно), и второй ответ откатывал
   * сердце, только что поставленное первым. Поймано вживую: на сервере
   * отметка появлялась, а в интерфейсе сердце оставалось пустым.
   */
  const toggle = useCallback(
    (trackId: string) => {
      const wanted = !ids.has(trackId);

      setIds((was) => {
        const next = new Set(was);
        if (wanted) next.add(trackId);
        else next.delete(trackId);
        return next;
      });

      void setTrackFavorite(trackId, wanted).then((result) => {
        // `null` — не сохранилось: возвращаем как было. Сервер мог и
        // разойтись с нами (двойной клик), поэтому верим его ответу.
        const confirmed = result ? result.favorited : !wanted;
        setIds((now) => {
          const back = new Set(now);
          if (confirmed) back.add(trackId);
          else back.delete(trackId);
          return back;
        });
      });
    },
    [ids],
  );

  const has = useCallback((trackId: string) => ids.has(trackId), [ids]);

  return (
    <FavoritesContext.Provider value={{ has, toggle, ready }}>
      {children}
    </FavoritesContext.Provider>
  );
}

/** Сердце на карточке и в строке списка. */
export function MusicFavoriteButton({
  trackId,
  title,
  className = "",
}: {
  trackId: string;
  title: string;
  className?: string;
}) {
  const favorites = useMusicFavorites();
  if (!favorites?.ready) return null;

  const marked = favorites.has(trackId);

  return (
    <button
      type="button"
      aria-label={marked ? `Убрать из избранного: ${title}` : `В избранное: ${title}`}
      aria-pressed={marked}
      onClick={(event) => {
        // Кнопка лежит поверх ссылки-обложки: без этого клик заодно уводил бы
        // на страницу записи. Тот же приём, что у кнопки запуска.
        event.preventDefault();
        event.stopPropagation();
        favorites.toggle(trackId);
      }}
      className={`flex size-9 items-center justify-center rounded-full transition-colors ${
        marked ? "text-magenta" : "text-text-2 hover:text-text-0"
      } ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-4"
        fill={marked ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M19 14c1.5-1.5 3-3.3 3-5.5A5.5 5.5 0 0 0 12 5.6 5.5 5.5 0 0 0 2 8.5c0 2.2 1.5 4 3 5.5l7 7z" />
      </svg>
    </button>
  );
}
