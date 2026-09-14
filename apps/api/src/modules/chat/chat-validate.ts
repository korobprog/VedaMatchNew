import {
  CHAT_MAX_ATTACHMENTS,
  CHAT_MESSAGE_MAX_LENGTH,
  type ChatAttachmentInput,
  type ChatAttachmentKind,
} from '@vedamatch/shared';

/**
 * Проверка того, что приходит из браузера. Отдельным модулем, потому что
 * вложения приходят четырьмя разными способами и у каждого свои обязательные
 * поля: сохранить в базу «сторис без текста» или «фото без ссылки» — значит
 * получить в переписке пустой прямоугольник, который уже не починить.
 */

export class ChatValidationError extends Error {}

/** Файловые вложения обязаны нести ссылку, карточки сервисов — заголовок. */
const FILE_KINDS = new Set<ChatAttachmentKind>(['image', 'file', 'voice']);
const CARD_KINDS = new Set<ChatAttachmentKind>([
  'story',
  'notice',
  'listing',
  'contact',
  'vacancy',
  'stay',
]);

const MAX_TITLE = 200;
const MAX_CARD_BODY = 1000;
/** Дорожка голосового: больше двух сотен столбиков на экране не различить. */
const MAX_WAVEFORM_POINTS = 200;

export function normalizeMessageBody(raw: string | undefined): string {
  const body = (raw ?? '').trim();
  if (body.length > CHAT_MESSAGE_MAX_LENGTH)
    throw new ChatValidationError(
      `Сообщение длиннее ${CHAT_MESSAGE_MAX_LENGTH} символов`,
    );
  return body;
}

/**
 * Ведёт ли адрес в наше хранилище — и именно в объект этой беседы. `prefix` —
 * начало адресов бакета (`ChatUploadsService.storagePrefix`); `null` означает,
 * что S3 не настроен, и тогда своего файла не бывает вовсе. Мало того что
 * адрес начинается с адреса бакета — все свои загрузки лежат под
 * `chat/${conversationId}/...` (см. `ChatUploadsService.store`/`storeImage`),
 * и ключ обязан начинаться ровно с этого пути: иначе по префиксу бакета
 * проходит чужой аватар или файл другой беседы.
 */
export function isStorageUrl(
  url: string,
  prefix: string | null,
  conversationId: string,
): boolean {
  if (!prefix || !url.startsWith(prefix)) return false;
  const key = url.slice(prefix.length);
  return key.startsWith(`chat/${conversationId}/`);
}

/**
 * Адрес вложения обязан вести в наше хранилище, в объект именно этой беседы.
 *
 * В сообщение ссылку кладёт браузер — тем, что вернула загрузка, — и до этой
 * проверки принималась любая строка, начинающаяся с адреса бакета. Прямым
 * вызовом API отправитель клал в `url` чужой адрес — включая чужой аватар или
 * файл другой беседы, у которого тот же префикс бакета, — а веб рисует его
 * как `<img src>` и `<a href>`: чужой сервер узнавал IP получателя, его
 * браузер и точное время, когда переписку открыли, а «файл» вёл куда угодно.
 * Поэтому проверяем не только начало адреса, но и что ключ объекта лежит
 * именно в `chat/${conversationId}/`.
 */
export function assertStorageUrl(
  url: string | null | undefined,
  prefix: string | null,
  conversationId: string,
): void {
  if (!url) return;
  if (!isStorageUrl(url, prefix, conversationId))
    throw new ChatValidationError('Вложение не из нашего хранилища');
}

/** Любой символ-картинка Unicode: лица, сердца, ©️, 🏳️‍🌈 и прочее. */
const PICTOGRAPH = /\p{Extended_Pictographic}/u;
/** Флаг страны — пара «региональных букв», картинок в них нет. */
const FLAG = /^\p{Regional_Indicator}{2}$/u;
/** Цифра в квадрате (1️⃣, #️⃣) — тоже не картинка по Unicode. */
const KEYCAP = /^[0-9#*]️?⃣$/u;
const graphemes = new Intl.Segmenter('ru', { granularity: 'grapheme' });

/**
 * Реакция — ровно один смайлик, любой (VED-122).
 *
 * Раньше пропускались восемь из белого списка, и панель всех смайликов
 * упиралась бы в «Такой реакции нет». Узость списка защищала от строк
 * вместо реакций — это и проверяем: один видимый знак (семья через ZWJ,
 * флаг и оттенок кожи — тоже один), и он смайлик, а не буква.
 */
export function isSingleEmoji(value: string): boolean {
  if (typeof value !== 'string' || value.length === 0 || value.length > 32)
    return false;
  if ([...graphemes.segment(value)].length !== 1) return false;
  return FLAG.test(value) || KEYCAP.test(value) || PICTOGRAPH.test(value);
}

export function assertReactionEmoji(emoji: string): void {
  if (!isSingleEmoji(emoji)) throw new ChatValidationError('Такой реакции нет');
}

/**
 * Приводит вложения к тому, что можно писать в базу. Возвращает копию:
 * лишние поля из запроса дальше не едут, а `position` проставляется по
 * порядку, чтобы галерея не перемешалась при выборке.
 */
export function normalizeAttachments(
  input: ChatAttachmentInput[] | undefined,
  /** Начало адресов нашего бакета: чужие ссылки дальше не проходят. */
  storagePrefix: string | null,
  /** Беседа, в которую отправляется сообщение: ключ обязан лежать в её папке. */
  conversationId: string,
): ChatAttachmentInput[] {
  const list = input ?? [];
  if (list.length > CHAT_MAX_ATTACHMENTS)
    throw new ChatValidationError(
      `Больше ${CHAT_MAX_ATTACHMENTS} вложений в одном сообщении не бывает`,
    );

  return list.map((item, index) => {
    if (FILE_KINDS.has(item.kind) && !item.url)
      throw new ChatValidationError('У вложения нет ссылки на файл');
    if (CARD_KINDS.has(item.kind) && !item.title?.trim())
      throw new ChatValidationError('У карточки нет заголовка');

    // И файл, и картинка карточки чужого сервиса лежат в нашем бакете:
    // карточка уезжает снимком, а снимок с чужого адреса — не снимок.
    assertStorageUrl(item.url, storagePrefix, conversationId);
    assertStorageUrl(item.previewUrl, storagePrefix, conversationId);

    const waveform = (item.waveform ?? [])
      .slice(0, MAX_WAVEFORM_POINTS)
      .map((level) => Math.max(0, Math.min(100, Math.round(level))));

    return {
      kind: item.kind,
      url: item.url,
      key: item.key,
      previewUrl: item.previewUrl,
      title: cut(item.title, MAX_TITLE),
      subtitle: cut(item.subtitle, MAX_TITLE),
      body: cut(item.body, MAX_CARD_BODY),
      sourceService: cut(item.sourceService, 40),
      sourceId: cut(item.sourceId, 100),
      mimeType: cut(item.mimeType, 100),
      sizeBytes: positive(item.sizeBytes),
      durationSec: positive(item.durationSec),
      width: positive(item.width),
      height: positive(item.height),
      waveform,
      position: index,
    };
  });
}

/** Пустое сообщение без вложений отправлять нечего. */
export function assertSendable(
  body: string,
  attachments: ChatAttachmentInput[],
): void {
  if (!body && attachments.length === 0)
    throw new ChatValidationError('Сообщение пустое');
}

function cut(
  value: string | null | undefined,
  max: number,
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

function positive(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
    return undefined;
  return Math.round(value);
}
