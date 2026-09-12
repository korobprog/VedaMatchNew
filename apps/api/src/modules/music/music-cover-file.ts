import { isMusicCoverScope } from './music-cover-validate';

/**
 * Отдача обложки через портал.
 *
 * Обложки лежат в общем бакете, который не отдаёт объекты анонимно: прямая
 * ссылка на него возвращает 403, и в каталоге вместо картинок были битые
 * значки. Открыть бакет наружу нельзя — в нём же вложения рабочих карточек и
 * аудиофайлы, а панель хранилища умеет только «весь бакет публичный».
 *
 * Поэтому файл достаёт сам портал своими ключами. Адрес при этом остаётся
 * постоянным и совпадает с ключом объекта (`music/covers/<вид>/<кто>/<файл>`),
 * так что кеш браузера, CDN и серверная разметка работают как раньше — в
 * отличие от подписанных ссылок, которые меняются каждые несколько часов.
 */

/** Что умеет отдавать обложка: то же, что принимает загрузка. */
const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * Имя файла обложки: uuid и расширение. Ничего другого в ключе не бывает —
 * его собирает `buildMusicCoverKey`, а не человек.
 */
const FILE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{3,5}$/i;

/** Владелец — обычный uuid участника. */
const OWNER_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MusicCoverFileRequest {
  scope: string;
  owner: string;
  file: string;
}

/**
 * Ключ объекта по частям адреса — или `null`, если путь не похож на обложку.
 *
 * Проверяем строго, а не «лишь бы не было точек»: этот маршрут открыт гостю и
 * читает файлы нашими ключами. Свободная строка здесь означала бы выдачу
 * любого объекта бакета — включая приватные вложения «Работы».
 */
export function musicCoverKeyFrom({
  scope,
  owner,
  file,
}: MusicCoverFileRequest): string | null {
  if (!isMusicCoverScope(scope)) return null;
  if (!OWNER_PATTERN.test(owner)) return null;
  if (!FILE_PATTERN.test(file)) return null;
  if (!musicCoverContentType(file)) return null;
  return `music/covers/${scope}/${owner}/${file}`;
}

/** Тип картинки по расширению; `null` — такого мы не отдаём. */
export function musicCoverContentType(file: string): string | null {
  const extension = file.split('.').pop()?.toLowerCase() ?? '';
  return CONTENT_TYPES[extension] ?? null;
}

/**
 * Кеш на год и «immutable»: имя файла содержит uuid, выданный один раз, и
 * содержимое по этому адресу никогда не меняется. Новая обложка — новый ключ
 * в карточке, а значит и новый адрес.
 */
export const MUSIC_COVER_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * Откуда браузер берёт обложки. Раньше это был адрес хранилища, но бакет не
 * отдаёт объекты анонимно — теперь их раздаёт сам портал, и базой служит его
 * собственный публичный адрес (`API_PUBLIC_URL`). Ключ объекта дописывается к
 * нему как есть: путь маршрута и ключ совпадают.
 */
export function musicCoverBaseUrl(
  apiPublicUrl: string | undefined,
): string | undefined {
  const base = apiPublicUrl?.trim().replace(/\/+$/, '');
  return base || undefined;
}
