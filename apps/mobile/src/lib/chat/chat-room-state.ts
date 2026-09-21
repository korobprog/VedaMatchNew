import type {
  ChatAttachmentInput,
  ChatConversationDetail,
  ChatMessageDto,
  ChatReplyPreview,
  ChatStreamEvent,
  ChatUserSummary,
} from '@vedamatch/shared';

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
    // Вложение ещё не имеет id с сервера — подставляем временный, только
    // чтобы список отрисовался; после settle заменяется настоящим
    // сообщением. Id обязан включать `seed` сообщения, а не только индекс:
    // индекс сам по себе одинаков у ЛЮБЫХ двух черновиков с одним
    // вложением («pending:att-0» у первого голосового и у второго,
    // отправленного следом, пока оба ещё не settled) — от этого ломался
    // реестр воспроизведения (`voice-playback-registry.ts` сверяет активный
    // плеер по строке id), два голосовых с одинаковым id переставали
    // корректно останавливать друг друга и звучали одновременно (VED-289).
    attachments: (input.attachments ?? []).map((attachment, index) => ({
      id: `${PENDING_PREFIX}${input.seed}-att-${index}`,
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
 * Шапку беседы могли поменять на экране участников: переименовать, сменить
 * описание и открытость, позвать или исключить человека. Берём из свежего
 * ответа только эти поля — лента сообщений и черновики в состоянии экрана
 * остаются прежними, иначе возврат с экрана участников сбрасывал бы
 * прокрутку и недописанное сообщение.
 */
export function applyConversationMeta(
  current: ChatConversationDetail,
  next: ChatConversationDetail,
): ChatConversationDetail {
  return {
    ...current,
    title: next.title,
    description: next.description,
    visibility: next.visibility,
    avatarUrl: next.avatarUrl,
    membersCount: next.membersCount,
    members: next.members,
    myRole: next.myRole,
    canWrite: next.canWrite,
  };
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
