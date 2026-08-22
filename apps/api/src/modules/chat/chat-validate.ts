import {
  CHAT_MAX_ATTACHMENTS,
  CHAT_MESSAGE_MAX_LENGTH,
  CHAT_REACTION_EMOJIS,
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

export function assertReactionEmoji(emoji: string): void {
  if (!(CHAT_REACTION_EMOJIS as readonly string[]).includes(emoji))
    throw new ChatValidationError('Такой реакции нет');
}

/**
 * Приводит вложения к тому, что можно писать в базу. Возвращает копию:
 * лишние поля из запроса дальше не едут, а `position` проставляется по
 * порядку, чтобы галерея не перемешалась при выборке.
 */
export function normalizeAttachments(
  input: ChatAttachmentInput[] | undefined,
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
