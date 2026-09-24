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
  artwork: { src: string; sizes: string; type?: string }[];
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
    artwork: buildArtwork(track.coverUrl),
  };
}

/**
 * Значок портала — обложка записи без своей (VED-393). Раньше массив был
 * пустым, и Android рисовал на экране блокировки серую ноту: карточку не
 * отличить от чужого приложения. Файл из манифеста PWA: он публичный
 * (`proxy.ts` пропускает `.png`) и уже лежит в кэше установленного
 * приложения.
 */
export const FALLBACK_ARTWORK = "/icons/icon-512.png";

/**
 * Тип картинки по расширению. Жёсткий `image/jpeg` на обложке в WebP или
 * PNG — повод для системы отбросить картинку как несоответствующую; не
 * знаем тип — не пишем его вовсе, система определит сама.
 */
export function artworkType(src: string): string | undefined {
  const path = src.split(/[?#]/, 1)[0].toLowerCase();
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".avif")) return "image/avif";
  return undefined;
}

/**
 * Обложка для системной карточки. Размеров несколько, одна и та же ссылка:
 * Android выбирает картинку по `sizes` под свой экран — уведомление 96–128,
 * экран блокировки 512, — и при единственном «512x512» на части прошивок
 * уведомление оставалось без картинки.
 */
export function buildArtwork(
  coverUrl: string | null | undefined,
): MediaSessionMetadata["artwork"] {
  const src = coverUrl || FALLBACK_ARTWORK;
  const type = artworkType(src);
  return ["96x96", "192x192", "512x512"].map((sizes) =>
    type ? { src, sizes, type } : { src, sizes },
  );
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

/** Шаги перемотки из настроек плеера (VED-388): назад и вперёд — свои. */
export interface MediaSeekSteps {
  back: number;
  forward: number;
}

/**
 * На сколько сдвинуть звук по кнопке системной карточки.
 *
 * `seekOffset` присылают не все: наушники и экран блокировки Android
 * обычно молчат, и тогда берём шаг из настроек — тот же, что у кнопок на
 * полосе. Два разных шага в одном плеере человек воспринимает как поломку.
 */
export function mediaSeekDelta(
  direction: -1 | 1,
  seekOffset: number | undefined,
  steps: MediaSeekSteps,
): number {
  const fallback = direction < 0 ? steps.back : steps.forward;
  const offset =
    typeof seekOffset === "number" && Number.isFinite(seekOffset) && seekOffset > 0
      ? seekOffset
      : fallback;
  return direction * offset;
}

/**
 * Кнопки. Ставятся заново на каждый набор обработчиков и шагов: система
 * запоминает их и зовёт, даже когда вкладка усыплена.
 */
export function applyMediaHandlers(
  handlers: MediaSessionHandlers,
  steps: MediaSeekSteps,
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
  // «Стоп» из шторки уведомлений Android: без обработчика кнопка там не
  // появлялась или ничего не делала. Останавливаем паузой, а не закрытием
  // плеера: запись и место в ней остаются, как после паузы на полосе.
  set("stop", () => handlers.pause());
  set("nexttrack", () => handlers.nextTrack());
  set("previoustrack", () => handlers.previousTrack());
  set("seekbackward", (details) =>
    handlers.seekBy(mediaSeekDelta(-1, details.seekOffset, steps)),
  );
  set("seekforward", (details) =>
    handlers.seekBy(mediaSeekDelta(1, details.seekOffset, steps)),
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
