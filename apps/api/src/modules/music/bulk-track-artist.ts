/**
 * Разбор запроса массовой смены исполнителя (VED-226).
 *
 * Отдельным чистым модулем: всё, что здесь может пойти не так, — это
 * разбор тела (пустой список, оба поля сразу, имя из пробелов), а сервис
 * вокруг него только ходит в базу.
 */

/** Потолок одного действия: весь каталог одним запросом не переносят. */
export const MAX_BULK_TRACKS = 1000;

/** Та же граница, что у имени в справочнике исполнителей. */
export const MAX_ARTIST_NAME = 160;

export type BulkArtistTarget =
  | { kind: 'id'; artistId: string }
  | { kind: 'name'; name: string }
  | { kind: 'clear' };

export interface BulkArtistPlan {
  trackIds: string[];
  target: BulkArtistTarget;
}

/** Ошибка разбора: сервис превращает её в 400 с тем же текстом. */
export class BulkArtistError extends Error {}

/**
 * Имя к виду справочника: пробелы по краям и повторные внутри убраны. Два
 * пробела подряд в имени из тега — частая причина «двух одинаковых»
 * исполнителей, и множить их отсюда не нужно.
 */
export function cleanArtistName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

export function planBulkArtist(body: unknown): BulkArtistPlan {
  if (!body || typeof body !== 'object') {
    throw new BulkArtistError('Пустой запрос');
  }
  const { trackIds, artistId, artistName } = body as Record<string, unknown>;

  if (!Array.isArray(trackIds) || trackIds.length === 0) {
    throw new BulkArtistError('Не выбрано ни одной записи');
  }
  if (trackIds.some((id) => typeof id !== 'string' || id.trim() === '')) {
    throw new BulkArtistError('Неверный список записей');
  }
  const unique = [...new Set(trackIds as string[])];
  if (unique.length > MAX_BULK_TRACKS) {
    throw new BulkArtistError(
      `За один раз — не больше ${MAX_BULK_TRACKS} записей`,
    );
  }

  const hasId = artistId !== undefined;
  const hasName = artistName !== undefined;
  if (hasId === hasName) {
    throw new BulkArtistError('Укажите исполнителя: из списка или по имени');
  }

  if (hasId) {
    if (artistId === null)
      return { trackIds: unique, target: { kind: 'clear' } };
    if (typeof artistId !== 'string' || artistId.trim() === '') {
      throw new BulkArtistError('Неверный исполнитель');
    }
    return { trackIds: unique, target: { kind: 'id', artistId } };
  }

  if (typeof artistName !== 'string') {
    throw new BulkArtistError('Неверное имя исполнителя');
  }
  const name = cleanArtistName(artistName);
  if (name === '') throw new BulkArtistError('Имя исполнителя пустое');
  if (name.length > MAX_ARTIST_NAME) {
    throw new BulkArtistError(`Имя длиннее ${MAX_ARTIST_NAME} знаков`);
  }
  return { trackIds: unique, target: { kind: 'name', name } };
}
