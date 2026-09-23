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
): string {
  return [
    chapterCount > 0
      ? `${chapterCount} ${plural(chapterCount, "глава", "главы", "глав")}`
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
export function audiobookResumeLabel(resume: MusicAudiobookResumeDto): string {
  const chapter = `глава ${resume.chapterNumber}`;
  return resume.positionSeconds > 0
    ? `Продолжить: ${chapter}, с ${formatTrackDuration(resume.positionSeconds)}`
    : `Продолжить: ${chapter}`;
}
