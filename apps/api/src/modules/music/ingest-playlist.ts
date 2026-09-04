import { POSITION_STEP } from './playlist-order';

/**
 * Подборка, собираемая из партии при публикации.
 *
 * Чистым модулем, а не куском транзакции: правила «когда подборка вообще
 * нужна» и «в каком порядке лягут записи» проверяются без базы, а ошибка в
 * них не падает — она тихо перемешивает альбом, и заметят это через неделю.
 */

/** Длина названия — та же, что у плейлиста человека: дальше не помещается. */
export const INGEST_PLAYLIST_MAX_TITLE = 120;

export interface IngestPlaylistPlan {
  title: string;
  items: { trackId: string; position: number }[];
}

/**
 * План подборки. `null` — собирать нечего: название пустое (админ просто
 * опубликовал партию) или ни одной записи не набралось.
 *
 * Позиции разрежённые и считаются тем же шагом, что при копировании чужого
 * плейлиста: подборку портала потом правят руками, и вставка в середину не
 * должна переписывать хвост.
 */
export function planIngestPlaylist(
  rawTitle: string | null | undefined,
  trackIds: readonly string[],
): IngestPlaylistPlan | null {
  const title = (rawTitle ?? '').trim().slice(0, INGEST_PLAYLIST_MAX_TITLE);
  if (!title) return null;

  // Пара `(playlistId, trackId)` уникальна, и повтор уронил бы всю
  // публикацию. Повториться записи неоткуда — у позиции свой трек, — но
  // цена страховки здесь нулевая, а цена отказа в транзакции высока.
  const seen = new Set<string>();
  const items: IngestPlaylistPlan['items'] = [];
  for (const trackId of trackIds) {
    if (!trackId || seen.has(trackId)) continue;
    seen.add(trackId);
    items.push({ trackId, position: items.length * POSITION_STEP + POSITION_STEP });
  }
  if (items.length === 0) return null;

  return { title, items };
}
