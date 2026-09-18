/**
 * Контракт между кнопкой «редактировать текст» в панели плеера
 * (`lyrics-panel.tsx`) и формой правки записи на её странице
 * (`track-admin-editor.tsx`) — VED-269.
 *
 * Панель плеера смонтирована глобально (корневой layout) и понятия не
 * имеет о форме правки — та рендерится только на `/music/tracks/[id]`,
 * причём лишь у части людей (редакция Музыки), и может быть даже не
 * смонтирована в момент клика (человек слушает запись, находясь совсем на
 * другой странице портала). Прямая связь между компонентами через
 * пропсы/контекст здесь невозможна — точка входа одна, адрес: та же
 * `?add=1`-игра, которой уже открывают шторку «В плейлист»
 * (`music-add-to-playlist.tsx`) по ссылке из ленты друзей.
 *
 * Общий модуль вместо двух литералов `"edit"`/`"lyrics"`, списанных в
 * разных файлах, — опечатка в одном из них молча ломает переход.
 */
export const MUSIC_LYRICS_EDIT_PARAM = "edit";
export const MUSIC_LYRICS_EDIT_VALUE = "lyrics";

/** Ссылка на запись, которая должна сразу открыть форму правки текста. */
export function buildTrackLyricsEditHref(trackId: string): string {
  return `/music/tracks/${trackId}?${MUSIC_LYRICS_EDIT_PARAM}=${MUSIC_LYRICS_EDIT_VALUE}`;
}

/** Просит ли адрес открыть форму правки текста сразу. */
export function wantsLyricsEdit(params: URLSearchParams): boolean {
  return params.get(MUSIC_LYRICS_EDIT_PARAM) === MUSIC_LYRICS_EDIT_VALUE;
}
