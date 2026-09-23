/**
 * С какой секунды продолжать запись из истории в плеере (VED-388).
 *
 * Позицию плеер и так хранит по каждой записи (`MusicPlayState`), история
 * лишь показывает её рядом со строкой. Пороги — те же, что у «Продолжить»
 * аудиокниги (`music-audiobook-resume.ts`), копией, а не импортом общего
 * порога: там решение про книгу, здесь про запись, и разъехаться им
 * разрешено.
 */

/** Меньше — запись по сути не начинали, «с 0:03» только путает. */
const MIN_RESUME_SECONDS = 5;

/**
 * Столько секунд до конца уже «дослушал»: heartbeat редкий, и последняя
 * позиция дослушанной записи почти никогда не равна её длительности.
 */
const FINISHED_TAIL_SECONDS = 15;

export function historyResumePosition(
  positionSeconds: number | null | undefined,
  durationSeconds: number,
): number | null {
  if (typeof positionSeconds !== 'number' || !Number.isFinite(positionSeconds)) {
    return null;
  }
  const at = Math.floor(positionSeconds);
  if (at < MIN_RESUME_SECONDS) return null;
  if (durationSeconds > 0 && at >= durationSeconds - FINISHED_TAIL_SECONDS) {
    return null;
  }
  return at;
}
