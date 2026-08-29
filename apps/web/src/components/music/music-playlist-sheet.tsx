"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MusicPlaylistPickDto } from "@vedamatch/shared";
import {
  addTrackToPlaylist,
  createPlaylist,
  getPlaylistsForTrack,
  removeTrackFromPlaylist,
} from "@/lib/music-playlists-api";
import { formatTotalDuration } from "@/lib/music-duration";
import { plural } from "@/lib/plural";
import { MusicCover } from "./music-cover";

/**
 * Шторка «В плейлист». См. макет `.design/music/Track.dc.html`.
 *
 * Сюда приводит ссылка из ленты друзей (`/music/tracks/:id?add=1`) и кнопка
 * плеера: компонент портала не имеет права импортировать компоненты Музыки,
 * поэтому обе они — обычные ссылки, а не общая модалка.
 *
 * Галочка применяется сразу, а не по кнопке внизу, хотя в макете та
 * подписана «Добавить». Команда идемпотентна, ответ мгновенный, и человек
 * видит результат там же, где нажал; кнопка, повторяющая уже сделанное,
 * только заставляет гадать, применилось ли. Поэтому она подписана «Готово»
 * и просто закрывает шторку.
 */
const VISIBILITY_LABEL: Record<MusicPlaylistPickDto["visibility"], string> = {
  private: "только я",
  friends: "для друзей",
  public: "всем",
};

export function MusicPlaylistSheet({
  trackId,
  trackTitle,
  artistName,
  onClose,
}: {
  trackId: string;
  trackTitle: string;
  artistName: string | null;
  onClose: () => void;
}) {
  const [items, setItems] = useState<MusicPlaylistPickDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const sheetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    getPlaylistsForTrack(trackId)
      .then((data) => alive && setItems(data.items))
      .catch((cause: Error) => alive && setError(cause.message));
    return () => {
      alive = false;
    };
  }, [trackId]);

  // Escape закрывает: шторка перекрывает страницу целиком, и уводить с неё
  // только мышью — значит запереть того, кто работает с клавиатуры.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    sheetRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = useCallback(
    async (item: MusicPlaylistPickDto) => {
      setBusyId(item.id);
      setError(null);
      try {
        const result = item.containsTrack
          ? await removeTrackFromPlaylist(item.id, trackId)
          : await addTrackToPlaylist(item.id, trackId);
        setItems((was) =>
          (was ?? []).map((row) =>
            row.id === item.id
              ? {
                  ...row,
                  containsTrack: result.containsTrack,
                  trackCount: result.trackCount,
                }
              : row,
          ),
        );
      } catch (cause) {
        setError((cause as Error).message);
      } finally {
        setBusyId(null);
      }
    },
    [trackId],
  );

  const create = useCallback(async () => {
    const title = newTitle.trim();
    if (!title) return;
    setBusyId("new");
    setError(null);
    try {
      // Новая подборка сразу видна друзьям. Смысл собирать её на портале, где
      // люди слушают друг у друга, — а не в закрытом ящике: подборка, которую
      // никто не увидит, ничем не отличается от списка «нравится», который уже
      // есть. Круг узкий и уже согласованный человеком: видят только те, кто
      // открыл ему доступ мэтчем или контактами, — не «все в интернете».
      // Закрыть её обратно — три кнопки на странице плейлиста, и об этом
      // сказано прямо здесь, а не мелким шрифтом в настройках.
      const playlist = await createPlaylist({ title, visibility: "friends" });
      // Человек создал плейлист, стоя на записи: он хочет её туда положить,
      // а не получить пустой список и нажать ещё раз.
      const result = await addTrackToPlaylist(playlist.id, trackId);
      setItems((was) => [
        {
          ...playlist,
          trackCount: result.trackCount,
          containsTrack: true,
        },
        ...(was ?? []),
      ]);
      setNewTitle("");
      setCreating(false);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusyId(null);
    }
  }, [newTitle, trackId]);

  return (
    <>
      <div
        // Подложка гасит страницу и закрывает шторку по нажатию мимо неё.
        // Не кнопка: то же действие доступно с клавиатуры по Escape и
        // кнопкой «Готово», а лишняя остановка табуляции здесь только мешает.
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 z-50 bg-bg-0/60 backdrop-blur-[2px]"
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="music-sheet-title"
        tabIndex={-1}
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col gap-3 overflow-y-auto rounded-t-3xl border-t border-sheet-brd bg-sheet p-4 pb-[max(1rem,env(safe-area-inset-bottom))] outline-none sm:mx-auto sm:max-w-md sm:rounded-3xl sm:bottom-6"
      >
        <span
          aria-hidden="true"
          className="h-1 w-9 shrink-0 self-center rounded-full bg-white/20"
        />

        <div className="flex flex-col gap-0.5">
          <h2
            id="music-sheet-title"
            className="font-display text-lg font-bold text-text-0"
          >
            В плейлист
          </h2>
          <p className="truncate text-xs text-text-2">
            «{trackTitle}»{artistName ? ` · ${artistName}` : ""}
          </p>
        </div>

        {error && (
          <p role="alert" className="text-xs text-magenta">
            {error}
          </p>
        )}

        {items === null && !error && (
          <p className="py-4 text-sm text-text-2">Загружаем плейлисты…</p>
        )}

        {items?.length === 0 && (
          <p className="text-sm text-text-1">
            Плейлистов пока нет. Создайте первый — запись сразу в него ляжет.
          </p>
        )}

        {items && items.length > 0 && (
          <ul className="flex flex-col">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => void toggle(item)}
                  disabled={busyId === item.id}
                  aria-pressed={item.containsTrack}
                  className="flex w-full items-center gap-3 rounded-xl py-1.5 text-left transition-colors hover:bg-white/4 disabled:opacity-50"
                >
                  <span className="h-9 w-9 shrink-0 overflow-hidden rounded-[10px]">
                    <MusicCover
                      url={item.coverUrl}
                      seed={item.id}
                      alt=""
                      rounded="rounded-[10px]"
                    />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold text-text-0">
                      {item.title}
                    </span>
                    <span className="truncate text-[11px] text-text-2">
                      {item.trackCount}{" "}
                      {plural(item.trackCount, "запись", "записи", "записей")}
                      {item.totalSeconds > 0 &&
                        ` · ${formatTotalDuration(item.totalSeconds)}`}
                      {` · ${VISIBILITY_LABEL[item.visibility]}`}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                      item.containsTrack
                        ? "border-mint-edge bg-mint text-on-mint"
                        : "border-glass-brd"
                    }`}
                  >
                    {item.containsTrack && (
                      <svg
                        viewBox="0 0 24 24"
                        className="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M4 12.5l5 5L20 6.5" />
                      </svg>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {creating ? (
          <div className="flex flex-col gap-2 border-t border-glass-brd pt-3">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void create();
              }}
              maxLength={120}
              placeholder="Название плейлиста"
              aria-label="Название плейлиста"
              className="h-11 min-w-0 flex-1 rounded-xl border border-glass-brd bg-transparent px-3 text-sm text-text-0 placeholder:text-text-2"
            />
            <button
              type="button"
              onClick={() => void create()}
              disabled={!newTitle.trim() || busyId === "new"}
              className="btn-mint h-11 shrink-0 rounded-xl px-4 text-sm font-bold disabled:opacity-50"
            >
              Создать
            </button>
          </div>
          {/* Сказано до нажатия, а не после: доступ по умолчанию — не то, что
              человек должен обнаружить, увидев свою подборку у друга. */}
          <p className="text-xs text-text-2">
            Новый плейлист виден друзьям. Закрыть или открыть всем — на его
            странице.
          </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex items-center gap-3 border-t border-glass-brd py-3 text-left"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-dashed border-white/25">
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 text-text-1"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            <span className="text-sm font-semibold text-text-1">
              Создать плейлист
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className="btn-mint h-12 shrink-0 rounded-xl text-[15px] font-bold"
        >
          Готово
        </button>
      </div>
    </>
  );
}
