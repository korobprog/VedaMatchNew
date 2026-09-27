/**
 * Короткая кнопка звука — «пуск / пауза» (VED-577): то, что в шапке делают
 * горячие кнопки «Плеер» и «Радио», одним значком там, где шапки не
 * достать, — в окне задачи «Работы» (окно накрывает шапку затемнением).
 *
 * Радио главнее плеера: пока идёт эфир, плеер молчит. У эфира нет паузы —
 * его «пауза» выключает радио, как кнопка «Выключить» на полосе эфира;
 * эфир, поставленный на паузу снаружи (звонок, экран блокировки), кнопка
 * продолжает. Без эфира — пауза и продолжение записи в плеере. Когда нет ни
 * эфира, ни записи, кнопки нет: запускать нечего, а уводить из окна задачи
 * в Медиатеку она не должна.
 */

export type CompactSoundStep =
  | "radio-stop"
  | "radio-resume"
  | "player-pause"
  | "player-resume";

export interface CompactSoundPlan {
  step: CompactSoundStep;
  /** Звук идёт — на кнопке пауза. */
  playing: boolean;
  label: string;
}

export function planCompactSound(state: {
  radio: { active: boolean; paused: boolean } | null;
  player: { hasTrack: boolean; isPlaying: boolean } | null;
}): CompactSoundPlan | null {
  const { radio, player } = state;
  if (radio?.active) {
    return radio.paused
      ? { step: "radio-resume", playing: false, label: "Продолжить эфир" }
      : { step: "radio-stop", playing: true, label: "Выключить радио" };
  }
  if (!player?.hasTrack) return null;
  return player.isPlaying
    ? { step: "player-pause", playing: true, label: "Пауза" }
    : { step: "player-resume", playing: false, label: "Слушать дальше" };
}
