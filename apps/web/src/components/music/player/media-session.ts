import type { MusicTrackDto } from "@vedamatch/shared";

/**
 * Media Session: обложка, название и кнопки на экране блокировки, в
 * наушниках и в шторке уведомлений.
 *
 * Без этого мобильный плеер воспринимается как поломанный: звук идёт, а
 * управлять им нельзя, не разблокировав телефон и не найдя вкладку. План
 * относит его к обязательному в v1 именно поэтому.
 *
 * Всё под проверкой поддержки: на десктопных браузерах без Media Session
 * плеер обязан работать так же, просто без карточки в системе.
 */

export interface MediaSessionMetadata {
  title: string;
  artist: string;
  album: string;
  artwork: { src: string; sizes: string; type: string }[];
}

/**
 * Что показать в системной карточке.
 *
 * Чистая функция и под тестом: подставить сюда пустую строку вместо
 * исполнителя легко, а увидеть это можно только на экране блокировки
 * телефона — то есть почти никогда.
 */
export function buildMediaMetadata(track: MusicTrackDto): MediaSessionMetadata {
  return {
    title: track.title,
    // Системная карточка не умеет «пусто»: там, где нет исполнителя, лучше
    // честная строка, чем пустая полоса под названием.
    artist: track.artist?.name ?? "Исполнитель не указан",
    album: track.album?.title ?? "VedaMatch",
    // Без обложки массив пустой: система нарисует свою заглушку, а ссылка в
    // никуда дала бы битую картинку на экране блокировки.
    artwork: track.coverUrl
      ? [{ src: track.coverUrl, sizes: "512x512", type: "image/jpeg" }]
      : [],
  };
}

export interface MediaSessionHandlers {
  play: () => void;
  pause: () => void;
  nextTrack: () => void;
  previousTrack: () => void;
  seekTo: (seconds: number) => void;
  seekBy: (delta: number) => void;
}

function supported(): boolean {
  return typeof navigator !== "undefined" && "mediaSession" in navigator;
}

/** Карточка в системе. */
export function applyMediaMetadata(track: MusicTrackDto): void {
  if (!supported() || typeof MediaMetadata === "undefined") return;

  const meta = buildMediaMetadata(track);
  navigator.mediaSession.metadata = new MediaMetadata(meta);
}

/**
 * Кнопки. Ставятся один раз на набор обработчиков: система запоминает их и
 * зовёт, даже когда вкладка усыплена.
 *
 * `seekbackward` и `seekforward` — те же 15 секунд, что у кнопок в полосе:
 * два разных шага в одном плеере человек воспринимает как поломку.
 */
export function applyMediaHandlers(
  handlers: MediaSessionHandlers,
  seekStepSeconds: number,
): void {
  if (!supported()) return;

  const set = (
    action: MediaSessionAction,
    handler: MediaSessionActionHandler | null,
  ) => {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      // Браузер может не знать конкретное действие — остальные всё равно
      // должны встать.
    }
  };

  set("play", () => handlers.play());
  set("pause", () => handlers.pause());
  set("nexttrack", () => handlers.nextTrack());
  set("previoustrack", () => handlers.previousTrack());
  set("seekbackward", (details) =>
    handlers.seekBy(-(details.seekOffset ?? seekStepSeconds)),
  );
  set("seekforward", (details) =>
    handlers.seekBy(details.seekOffset ?? seekStepSeconds),
  );
  set("seekto", (details) => {
    if (typeof details.seekTime === "number") handlers.seekTo(details.seekTime);
  });
}

/**
 * Положение на дорожке. Без него системная карточка показывает статичный
 * ноль, и перемотка с экрана блокировки не работает.
 */
export function applyMediaPosition(
  positionSeconds: number,
  durationSeconds: number,
  rate: number,
): void {
  if (!supported() || !navigator.mediaSession.setPositionState) return;
  // Система отвергает позицию больше длительности и нулевую длительность —
  // до готовности метаданных лучше не трогать её вовсе.
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return;

  try {
    navigator.mediaSession.setPositionState({
      duration: durationSeconds,
      position: Math.min(Math.max(0, positionSeconds), durationSeconds),
      playbackRate: rate > 0 ? rate : 1,
    });
  } catch {
    // Ничего страшного: карточка просто останется без ползунка.
  }
}

export function applyMediaPlaybackState(isPlaying: boolean): void {
  if (!supported()) return;
  navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
}

/** Плеер остановлен: убираем карточку, чтобы она не висела в системе. */
export function clearMediaSession(): void {
  if (!supported()) return;
  navigator.mediaSession.metadata = null;
  navigator.mediaSession.playbackState = "none";
}
