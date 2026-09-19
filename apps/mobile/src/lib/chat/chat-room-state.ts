import type { ChatAttachmentInput, ChatMessageDto, ChatReplyPreview, ChatStreamEvent, ChatUserSummary } from '@vedamatch/shared';

/**
 * Лента открытой беседы. Сообщения хранятся по возрастанию времени, как их
 * отдаёт API. Черновик отправки получает временный id `pending:…` и
 * заменяется ответом сервера; если то же сообщение уже пришло потоком,
 * черновик просто убирается (правило с сайта, `pending-message.ts`).
 */

const PENDING_PREFIX = 'pending:';

export function isPendingMessage(message: ChatMessageDto): boolean {
  return message.id.startsWith(PENDING_PREFIX);
}

export function buildPendingMessage(input: {
  seed: string;
  conversationId: string;
  author: ChatUserSummary;
  body: string;
  now: Date;
  /** Вложения и цитата ответа — видны в пузыре, пока сообщение отправляется. */
  attachments?: ChatAttachmentInput[];
  replyTo?: ChatReplyPreview | null;
}): ChatMessageDto {
  return {
    id: `${PENDING_PREFIX}${input.seed}`,
    conversationId: input.conversationId,
    author: input.author,
    body: input.body,
    replyTo: input.replyTo ?? null,
    // Вложение ещё не имеет id с сервера — подставляем индекс, только чтобы
    // список отрисовался; после settle заменяется настоящим сообщением.
    attachments: (input.attachments ?? []).map((attachment, index) => ({
      id: `${PENDING_PREFIX}att-${index}`,
      kind: attachment.kind,
      url: attachment.url,
      previewUrl: attachment.url,
      title: attachment.title,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      width: attachment.width,
      height: attachment.height,
      // Голосовое: длительность и дорожка нужны сразу — плеер в
      // оптимистичном пузыре не должен ждать ответа сервера, чтобы
      // нарисовать волну и время (VED-286).
      durationSec: attachment.durationSec,
      waveform: attachment.waveform,
    })),
    reactions: [],
    createdAt: input.now.toISOString(),
    readByOthers: false,
  } as ChatMessageDto;
}

export function settlePendingMessage(
  messages: readonly ChatMessageDto[],
  pendingId: string,
  saved: ChatMessageDto,
): ChatMessageDto[] {
  const rest = messages.filter((message) => message.id !== pendingId);
  return rest.some((message) => message.id === saved.id) ? rest : [...rest, saved];
}

export function dropPendingMessage(messages: readonly ChatMessageDto[], pendingId: string): ChatMessageDto[] {
  return messages.filter((message) => message.id !== pendingId);
}

/** Старшая страница приклеивается сверху без дублей. */
export function prependOlder(messages: readonly ChatMessageDto[], older: readonly ChatMessageDto[]): ChatMessageDto[] {
  const known = new Set(messages.map((message) => message.id));
  return [...older.filter((message) => !known.has(message.id)), ...messages];
}

export function applyRoomEvent(
  messages: readonly ChatMessageDto[],
  event: ChatStreamEvent,
  conversationId: string,
): ChatMessageDto[] {
  if (!('conversationId' in event) || event.conversationId !== conversationId) return [...messages];
  switch (event.type) {
    case 'message.created':
      return messages.some((message) => message.id === event.message.id) ? [...messages] : [...messages, event.message];
    case 'message.updated':
      return messages.map((message) => (message.id === event.message.id ? event.message : message));
    case 'message.deleted':
      return messages.map((message) =>
        message.id === event.messageId
          ? { ...message, body: '', attachments: [], reactions: [], deletedAt: message.deletedAt ?? new Date().toISOString() }
          : message,
      );
    case 'reaction.set':
      return messages.map((message) => (message.id === event.messageId ? { ...message, reactions: event.reactions } : message));
    default:
      return [...messages];
  }
}

/**
 * Собеседник прочитал: свои сообщения не позже отметки становятся
 * прочитанными. В группе сервер отмечает `readByOthers` только когда прочитали
 * все, поэтому это правило применяем лишь в личной беседе.
 */
export function applyReadByOther(
  messages: readonly ChatMessageDto[],
  myUserId: string,
  lastReadAt: string,
): ChatMessageDto[] {
  const until = new Date(lastReadAt).getTime();
  return messages.map((message) =>
    message.author.id === myUserId && !isPendingMessage(message) && new Date(message.createdAt).getTime() <= until
      ? { ...message, readByOthers: true }
      : message,
  );
}
