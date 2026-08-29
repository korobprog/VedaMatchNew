import {
  MUSIC_COVER_ACCEPTED_MIME,
  type MusicCoverMime,
  type MusicCoverScope,
} from '@vedamatch/shared';

/**
 * Правила обложки: что принимаем и чей ключ разрешаем записать в карточку.
 *
 * Чистым модулем и под тестом, потому что здесь два разных запрета, и оба
 * молчаливые. Первый — размер и тип: их присылает браузер, и подписанный PUT
 * выписывается ровно под них, так что ошибка здесь превращается в объект,
 * который уже лежит в бакете. Второй — принадлежность ключа: без проверки
 * человек присылает в `coverKey` чужую строку и подменяет обложку записи в
 * каталоге, ни разу ничего не залив.
 */

/**
 * Потолок обложки. Два мегабайта — это заведомо больше, чем нужно квадрату
 * 1000×1000 в jpeg, и заведомо меньше, чем фотография с телефона без сжатия.
 */
export const MUSIC_COVER_MAX_BYTES = 2 * 1024 * 1024;

export const MUSIC_COVER_SCOPES: readonly MusicCoverScope[] = [
  'track',
  'artist',
  'album',
  'playlist',
];

/** Расширение по типу: оно попадает в имя объекта и в адрес на CDN. */
const EXTENSION_BY_MIME: Record<MusicCoverMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export type MusicCoverRejection =
  | 'scope'
  | 'mime'
  | 'empty'
  | 'too-large'
  | 'foreign-key'
  | 'malformed-key';

/** Тексты для человека: отказ обязан говорить, что делать. */
export const MUSIC_COVER_REJECTION_TEXT: Record<MusicCoverRejection, string> = {
  scope: 'Неизвестный вид обложки.',
  mime: 'Обложка принимается в JPEG, PNG или WebP.',
  empty: 'Файл пустой.',
  'too-large': 'Обложка больше 2 МБ. Уменьшите картинку и попробуйте снова.',
  'foreign-key': 'Эта обложка загружена не вами.',
  'malformed-key': 'Обложка не найдена. Загрузите её заново.',
};

export interface MusicCoverValidationResult {
  ok: boolean;
  rejection?: MusicCoverRejection;
}

const OK: MusicCoverValidationResult = { ok: true };

const fail = (rejection: MusicCoverRejection): MusicCoverValidationResult => ({
  ok: false,
  rejection,
});

export function isMusicCoverScope(value: unknown): value is MusicCoverScope {
  return MUSIC_COVER_SCOPES.includes(value as MusicCoverScope);
}

export function isMusicCoverMime(value: unknown): value is MusicCoverMime {
  return MUSIC_COVER_ACCEPTED_MIME.includes(value as MusicCoverMime);
}

export function coverExtensionFor(mime: MusicCoverMime): string {
  return EXTENSION_BY_MIME[mime];
}

/**
 * Проверка заявки — до выписки подписанной ссылки. После неё поздно: байты
 * уже в бакете, и остаётся только удалять.
 */
export function validateMusicCoverRequest(input: {
  scope: unknown;
  mime: unknown;
  sizeBytes: unknown;
}): MusicCoverValidationResult {
  if (!isMusicCoverScope(input.scope)) return fail('scope');
  if (!isMusicCoverMime(input.mime)) return fail('mime');

  const size = Number(input.sizeBytes);
  if (!Number.isFinite(size) || size <= 0) return fail('empty');
  if (size > MUSIC_COVER_MAX_BYTES) return fail('too-large');

  return OK;
}

/**
 * Ключ обложки. Вид и владелец — в самом пути, потому что по нему же потом
 * проверяется право записать этот ключ в карточку.
 */
export function buildMusicCoverKey(
  scope: MusicCoverScope,
  ownerId: string,
  extension: string,
  uuid: string,
): string {
  const safe = extension.replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'jpg';
  return `music/covers/${scope}/${ownerId}/${uuid}.${safe}`;
}

/**
 * Можно ли записать этот ключ в карточку.
 *
 * Ключ приходит от браузера вместе с правкой, и без проверки им подменяют
 * что угодно: прислал чужую строку — и обложка записи в каталоге стала
 * картинкой из чужого плейлиста. Сверяем и вид, и владельца: выписанной под
 * свой плейлист ссылкой нельзя тронуть исполнителя.
 */
export function isOwnMusicCoverKey(
  key: string,
  scope: MusicCoverScope,
  /**
   * Владелец. Необязателен намеренно: карточки каталога правит только
   * администратор, а он и так вправе снять или опубликовать любую запись —
   * сверять там ещё и того, кто залил картинку, значит запретить второму
   * администратору доделать начатое первым. У плейлиста владелец обязателен:
   * его правит кто угодно.
   */
  ownerId?: string,
): MusicCoverValidationResult {
  const parts = key.split('/');
  // `music / covers / <scope> / <ownerId> / <файл>` — ровно пять частей.
  if (parts.length !== 5) return fail('malformed-key');
  if (parts[0] !== 'music' || parts[1] !== 'covers') return fail('malformed-key');
  if (!parts[3] || !parts[4]) return fail('malformed-key');
  if (parts[2] !== scope) return fail('foreign-key');
  if (ownerId !== undefined && parts[3] !== ownerId) return fail('foreign-key');

  return OK;
}

/**
 * Что записать в `coverKey` при сохранении карточки.
 *
 * `undefined` на выходе — поле не трогаем. Отдельный случай от `null`: там
 * обложку снимают, здесь о ней просто не говорили.
 *
 * Ключ, совпавший с уже записанным, не проверяется намеренно. Форма
 * возвращает его как есть при любой правке, а залить обложку мог другой
 * администратор — со строгой проверкой второй администратор не смог бы
 * переименовать исполнителя, чью обложку загрузил первый.
 */
export function resolveMusicCoverKey(input: {
  next: string | null | undefined;
  current: string | null;
  scope: MusicCoverScope;
  /** Обязателен только там, где карточку правит не администратор. */
  ownerId?: string;
}):
  | { ok: true; value: string | null | undefined }
  | { ok: false; rejection: MusicCoverRejection } {
  const { next, current, scope, ownerId } = input;

  if (next === undefined) return { ok: true, value: undefined };
  if (next === null) return { ok: true, value: null };
  if (next === current) return { ok: true, value: undefined };

  const check = isOwnMusicCoverKey(next, scope, ownerId);
  if (!check.ok) return { ok: false, rejection: check.rejection! };

  return { ok: true, value: next };
}
