import type { MusicAudiobookResumeDto } from '@vedamatch/shared';

/**
 * Откуда продолжать аудиокнигу (VED-297).
 *
 * Отдельного «закладочного» хранилища у книги нет и не нужно: плеер уже
 * сохраняет позицию каждой записи (`MusicPlayState`, heartbeat раз в
 * несколько секунд и при уходе со страницы). Книга — упорядоченный список
 * записей, значит, место в книге — это позиция в той главе, которую слушали
 * последней. Чистым модулем и под тестом: здесь все решения «что считать
 * дослушанным» и «когда предлагать начать сначала».
 */

/**
 * Сколько секунд до конца главы уже считаются «дослушал». Heartbeat плеера
 * редкий, и последняя сохранённая позиция дослушанной главы почти никогда не
 * равна её длительности — без запаса человек возвращался бы к последним
 * секундам главы, которую закончил.
 */
export const AUDIOBOOK_FINISHED_TAIL_SECONDS = 15;

/**
 * Меньше этого в первой главе — книгу по сути не начинали: «Продолжить
 * с 0:03» только путает, честнее предложить «Слушать».
 */
export const AUDIOBOOK_MIN_RESUME_SECONDS = 5;

export interface ResumeChapter {
  trackId: string;
  durationSeconds: number;
}

export interface ResumePlayState {
  trackId: string;
  positionSeconds: number;
  updatedAt: Date;
}

export function resolveAudiobookResume(
  chapters: ResumeChapter[],
  states: ResumePlayState[],
): MusicAudiobookResumeDto | null {
  const indexOf = new Map(chapters.map((row, at) => [row.trackId, at]));

  let latest: { state: ResumePlayState; index: number } | null = null;
  for (const state of states) {
    const index = indexOf.get(state.trackId);
    if (index === undefined) continue;
    if (!latest || state.updatedAt > latest.state.updatedAt) {
      latest = { state, index };
    }
  }
  if (!latest) return null;

  const chapter = chapters[latest.index];
  const position = Math.max(0, Math.floor(latest.state.positionSeconds));
  const finished =
    chapter.durationSeconds > 0 &&
    position >= chapter.durationSeconds - AUDIOBOOK_FINISHED_TAIL_SECONDS;

  if (finished) {
    const next = chapters[latest.index + 1];
    // Последняя глава дослушана — книга закончена, предлагать нечего.
    if (!next) return null;
    return {
      trackId: next.trackId,
      chapterNumber: latest.index + 2,
      positionSeconds: 0,
    };
  }

  if (latest.index === 0 && position < AUDIOBOOK_MIN_RESUME_SECONDS) {
    return null;
  }

  return {
    trackId: chapter.trackId,
    chapterNumber: latest.index + 1,
    positionSeconds: position,
  };
}
