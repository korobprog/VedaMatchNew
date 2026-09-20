/**
 * Где показываются аудиокниги (VED-237).
 *
 * Просили одно: «отображение всех аудиокниг должно находиться внутри этой
 * кнопки». Значит, у каталога два непересекающихся среза — обычная
 * Медиатека и раздел «Аудиокниги», — и решает, в какой попала запись,
 * отметка `isAudiobook` у её исполнителя (наследование как у корневой
 * категории, VED-165-2).
 *
 * Отдельным модулем и под тестом, потому что тут ровно одна ошибка стоит
 * дорого и не видна глазами: запись **без исполнителя**. В Prisma условие
 * по вложенной связи (`artist: { isAudiobook: false }`) не совпадает, когда
 * связи нет вовсе, — и полторы сотни записей прода, у которых исполнитель
 * не проставлен, молча исчезли бы из каталога. Поэтому «не аудиокнига» —
 * это «исполнитель не отмечен ИЛИ исполнителя нет».
 */

/** Условие для `where` Prisma: записи обычного каталога. */
export type MusicAudiobookCondition =
  | { artist: { isAudiobook: true } }
  | { OR: [{ artistId: null }, { artist: { isAudiobook: false } }] };

/**
 * Условие среза каталога.
 *
 * `scope: 'catalog'` — всё, кроме аудиокниг (в том числе записи без
 * исполнителя); `scope: 'audiobooks'` — только они.
 */
export function audiobookScopeCondition(
  scope: 'catalog' | 'audiobooks',
): MusicAudiobookCondition {
  if (scope === 'audiobooks') return { artist: { isAudiobook: true } };
  return { OR: [{ artistId: null }, { artist: { isAudiobook: false } }] };
}

/**
 * То же условие для выборки исполнителей: у чтеца карточка живёт в разделе
 * «Аудиокниги», у остальных — на витрине Медиатеки. Здесь исполнитель есть
 * всегда, поэтому обходимся плоским полем.
 */
export function audiobookArtistCondition(scope: 'catalog' | 'audiobooks'): {
  isAudiobook: boolean;
} {
  return { isAudiobook: scope === 'audiobooks' };
}
