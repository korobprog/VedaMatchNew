import type { MusicAudiobookResumeDto } from "@vedamatch/shared";
import { formatTotalDuration, formatTrackDuration } from "@/lib/music-duration";
import { plural } from "@/lib/plural";

/**
 * Подписи аудиокниг (VED-297). Отдельным модулем и под тестом: одна и та
 * же книга подписывается в трёх местах — плитка раздела, шапка страницы,
 * страница чтеца, — и числительные с длительностью в них не должны
 * разъехаться.
 */

/** «12 глав · 5 ч 20 мин» — пустые части выпадают. */
export function audiobookMeta(
  chapterCount: number,
  totalSeconds: number,
  /** Как зовётся часть: главы у книг, лекции у циклов (VED-437). */
  part: [one: string, few: string, many: string] = ["глава", "главы", "глав"],
): string {
  return [
    chapterCount > 0
      ? `${chapterCount} ${plural(chapterCount, ...part)}`
      : null,
    totalSeconds > 0 ? formatTotalDuration(totalSeconds) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Подпись кнопки продолжения: «Продолжить: глава 3, с 12:34». С начала
 * главы — без времени: «с 0:00» читается как «с начала книги».
 */
export function audiobookResumeLabel(
  resume: MusicAudiobookResumeDto,
  part = "глава",
): string {
  const chapter = `${part} ${resume.chapterNumber}`;
  return resume.positionSeconds > 0
    ? `Продолжить: ${chapter}, с ${formatTrackDuration(resume.positionSeconds)}`
    : `Продолжить: ${chapter}`;
}

/**
 * С какой секунды продолжать главу, которая уже стоит в плеере на паузе.
 *
 * Плеер, поднятый из сохранённого состояния, знает позицию, но показывает
 * ноль, пока файл не начал грузиться. Взять этот ноль — значит начать главу
 * заново и потерять место. Поэтому ноль плеера уступает серверной позиции
 * той же главы; ненулевая позиция плеера свежее серверной и побеждает.
 */
export function pausedPosition(
  playerSeconds: number,
  serverSeconds: number,
): number {
  const player = Math.max(0, Math.floor(playerSeconds || 0));
  return player > 0 ? player : Math.max(0, Math.floor(serverSeconds || 0));
}
