import type { MusicRadioItemDto } from "@vedamatch/shared";

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
