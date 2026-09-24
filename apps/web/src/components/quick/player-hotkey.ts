/**
 * Горячая кнопка «Плеер» (VED-416): плеер Музыки выкатывается на экран
 * свёрнутой полосой и играет.
 *
 * Что именно сделать, зависит от того, в каком состоянии плеер:
 *
 * - `resume` — запись в плеере есть и стоит на паузе: снять с паузы;
 * - `pause` — уже играет: повторное нажатие ставит на паузу (VED-438).
 *   Кнопка в это время сама показывает значок паузы, поэтому нажатие
 *   делает ровно то, что на ней нарисовано;
 * - `restore` — полосу закрыли крестиком или ещё ничего не слушали на этом
 *   устройстве: поднять недослушанную запись с сервера, с той же секунды, —
 *   так же, как это делает карточка Музыки на главной;
 * - если и на сервере ничего нет (`restorePlan` вернул `null`) — открыть
 *   Медиатеку: играть нечего, и кнопка обязана хоть куда-то привести.
 */

/** Подпись «Плеера», пока звук идёт: нажатие ставит на паузу (VED-438). */
export const PLAYER_PAUSE_LABEL = "Пауза";

export type PlayerHotkeyStep = "resume" | "pause" | "restore";

export function planPlayerHotkey(
  player: { hasTrack: boolean; isPlaying: boolean } | null,
): PlayerHotkeyStep {
  if (!player?.hasTrack) return "restore";
  return player.isPlaying ? "pause" : "resume";
}

export interface PlayerRestore {
  trackId: string;
  queue: string[];
  positionSeconds: number;
}

/** Что поднять из сохранённого на сервере состояния; `null` — нечего. */
export function restorePlan(
  state:
    | {
        trackId?: string | null;
        queue?: readonly unknown[] | null;
        positionSeconds?: number | null;
      }
    | null
    | undefined,
): PlayerRestore | null {
  if (!state || typeof state.trackId !== "string" || !state.trackId) return null;
  const queue = (state.queue ?? []).filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  const position =
    typeof state.positionSeconds === "number" && state.positionSeconds > 0
      ? state.positionSeconds
      : 0;
  return { trackId: state.trackId, queue, positionSeconds: position };
}
