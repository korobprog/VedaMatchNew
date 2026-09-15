import { CHAT_MAX_ATTACHMENTS } from '@vedamatch/shared';
import type { ChatAttachmentInput, ChatMessageDto, ChatUploadResult, EditChatMessageRequest, SendChatMessageRequest } from '@vedamatch/shared';

/**
 * Чистые функции композера: добавление вложений, вход/выход из правки с
 * отложенным черновиком, сборка тела запроса. Приём с сайта
 * (`apps/web/src/components/chat/chat-composer.tsx`) перенесён на состояние,
 * которым явно управляет экран, а не хуки на замыкании `useState`.
 */

export function canAddAttachment(count: number): boolean {
  return count < CHAT_MAX_ATTACHMENTS;
}

export function addAttachment(
  attachments: readonly ChatAttachmentInput[],
  next: ChatAttachmentInput,
): ChatAttachmentInput[] {
  if (!canAddAttachment(attachments.length)) return [...attachments];
  return [...attachments, next];
}

export function removeAttachmentAt(attachments: readonly ChatAttachmentInput[], index: number): ChatAttachmentInput[] {
  return attachments.filter((_, i) => i !== index);
}

/** Вложение из ответа загрузки: имя файла у документа, у фото — без заголовка. */
export function toAttachmentInput(result: ChatUploadResult, fileName?: string): ChatAttachmentInput {
  return {
    kind: result.kind,
    url: result.url,
    key: result.key,
    mimeType: result.mimeType,
    sizeBytes: result.sizeBytes,
    width: result.width,
    height: result.height,
    title: result.kind === 'file' ? fileName : undefined,
  };
}

/**
 * Вход в правку. Черновик поля откладывается только при первом входе — если
 * правка уже открыта и человек выбрал править другое сообщение, второй раз
 * текущий текст поля (это уже текст правки) в черновик не попадает. Тот же
 * приём, что на сайте (`chat-composer.tsx:161-171`).
 */
export function enterEditMode(input: {
  /** Id сообщения, которое сейчас редактируется в композере, `null` — нет. */
  currentEditingId: string | null;
  nextMessage: ChatMessageDto;
  currentDraft: string;
  /** Черновик, отложенный раньше (если это уже не первый вход в правку). */
  savedDraft: string | null;
}): { draft: string; draftBeforeEdit: string | null } {
  const draftBeforeEdit = input.currentEditingId === null ? input.currentDraft : input.savedDraft;
  return { draft: input.nextMessage.body, draftBeforeEdit };
}

/** Отмена правки — возвращает отложенный черновик поля. */
export function exitEditMode(savedDraft: string | null): { draft: string; draftBeforeEdit: null } {
  return { draft: savedDraft ?? '', draftBeforeEdit: null };
}

/** `null` — отправлять нечего (пусто и без вложений). */
export function buildSendRequest(input: {
  body: string;
  replyToId?: string | null;
  attachments: readonly ChatAttachmentInput[];
}): SendChatMessageRequest | null {
  const body = input.body.trim();
  if (!body && input.attachments.length === 0) return null;
  const request: SendChatMessageRequest = {};
  if (body) request.body = body;
  if (input.replyToId) request.replyToId = input.replyToId;
  if (input.attachments.length > 0) request.attachments = [...input.attachments];
  return request;
}

/** `null` — сервер не примет пустую правку (`normalizeMessageBody`). */
export function buildEditRequest(body: string): EditChatMessageRequest | null {
  const trimmed = body.trim();
  return trimmed ? { body: trimmed } : null;
}
