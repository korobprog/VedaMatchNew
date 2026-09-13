import type { UpdateMusicTrackRequest } from "@vedamatch/shared";

/**
 * Что редакция правит в карточке записи прямо в медиатеке (VED-102, VED-109):
 * название, исполнитель, текст бхаджана и картинка.
 */
export interface MusicTrackEditState {
  title: string;
  /** Пустая строка — «исполнитель не указан». */
  artistId: string;
  lyrics: string;
  transliteration: string;
  translation: string;
}

/**
 * Патч из того, что действительно изменилось.
 *
 * Отправлять форму целиком нельзя: API понимает отсутствие поля как «не
 * трогать», а присланное как «записать», и нечаянно отправленный старый текст
 * затёр бы правку, сделанную в админке минутой раньше.
 *
 * Пустое название не отправляется: у записи без названия в списке нечего
 * показать, и сервер его всё равно отклонит. Пустой текст — это `null`,
 * «текста нет», а не строка из пробелов.
 *
 * Картинка уходит, только если её трогали (`coverKey !== undefined`):
 * текущего ключа карточка не знает, и «ничего не выбрано» не должно снимать
 * уже стоящую обложку.
 */
export function buildTrackEditPatch(
  initial: MusicTrackEditState,
  draft: MusicTrackEditState,
  coverKey?: string | null,
): UpdateMusicTrackRequest {
  const patch: UpdateMusicTrackRequest = {};

  const title = draft.title.trim();
  if (title && title !== initial.title) patch.title = title;

  if (draft.artistId !== initial.artistId) {
    patch.artistId = draft.artistId || null;
  }

  for (const key of ["lyrics", "transliteration", "translation"] as const) {
    const next = draft[key].trim();
    if (next !== initial[key].trim()) patch[key] = next || null;
  }

  if (coverKey !== undefined) patch.coverKey = coverKey;

  return patch;
}
