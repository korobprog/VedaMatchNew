import type { MusicRadioItemDto, MusicTrackDto } from "@vedamatch/shared";
import { sortTracks } from "../sort-tracks";

/**
 * Переход из эфира в плеер Медиатеки (VED-542) — чистая часть.
 *
 * Обложка в полосе радио — кнопка «Слушать в плеере»: запись, что звучит в
 * эфире, продолжает играть в обычном плеере с той же секунды, а радио
 * уступает. Здесь — что можно перенести, с какой секунды и когда радио
 * пора замолчать.
 */

/**
 * Какую запись каталога переносить в плеер; `null` — нечего: вставка
 * редакции или эфир без записи. Тогда и кнопки нет.
 */
export function radioHandoffTrackId(
  item: Pick<MusicRadioItemDto, "kind" | "track"> | null,
): string | null {
  if (!item || item.kind !== "track") return null;
  return item.track?.id ?? null;
}

/**
 * С какой секунды записи продолжать в плеере.
 *
 * Первым — то, где на самом деле стоит элемент радио: он отстаёт от эфира
 * на время буферизации, и слушатель слышит именно его. Расчёт по эфиру
 * (`airSeconds`) — запасной путь, пока элемент ещё не знает своей позиции.
 * Не дальше длины записи в эфире.
 */
export function radioHandoffPosition(
  item: Pick<MusicRadioItemDto, "durationMs">,
  elementSeconds: number | null,
  airSeconds: number,
): number {
  const limit = item.durationMs / 1000;
  const heard =
    elementSeconds !== null &&
    Number.isFinite(elementSeconds) &&
    elementSeconds > 0
      ? elementSeconds
      : airSeconds;
  return Math.max(0, Math.min(limit, heard));
}

/**
 * Шаг перехода, когда у плеера Медиатеки что-то поменялось.
 *
 * Плеер «играет» с первого же нажатия, хотя звука ещё нет: погасить эфир
 * тогда значит оставить человека в тишине на всё время загрузки. Поэтому
 * радио звучит, пока плеер не зазвучал сам (`finish`), и только тогда
 * уступает. Не зазвучал — ошибка — переход отменяется (`cancel`), эфир идёт
 * дальше: лучше продолжить радио, чем замолчать.
 */
export type RadioHandoffStep = "wait" | "finish" | "cancel";

export function radioHandoffStep(main: {
  isPlaying: boolean;
  isLoading: boolean;
  loadError: string | null;
}): RadioHandoffStep {
  if (main.loadError) return "cancel";
  return main.isPlaying && !main.isLoading ? "finish" : "wait";
}

/**
 * Очередь плеера после перехода из эфира (VED-585): вся папка исполнителя
 * записи в том порядке, в каком её видно на странице исполнителя, — по
 * алфавиту (`MusicArtistPlayback`, VED-273), — чтобы «дальше» вело к
 * следующей записи папки, а не упиралось в одну-единственную. Записи нет
 * в папке (скрыта, исполнитель не пришёл) — только она сама, как раньше.
 */
export function radioHandoffQueue(
  trackId: string,
  artistTracks: readonly MusicTrackDto[] | null,
): string[] {
  if (!artistTracks?.some((track) => track.id === trackId)) return [trackId];
  return sortTracks([...artistTracks], "alpha", false).map((track) => track.id);
}
