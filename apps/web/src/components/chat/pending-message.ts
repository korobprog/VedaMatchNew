import type { ChatAttachmentInput, ChatMessageDto } from "@vedamatch/shared";

/**
 * Сообщение, которое уже отправили, но сервер ещё не ответил.
 *
 * Раньше `send()` ждал ответа и только потом дорисовывал сообщение: на
 * медленной сети человек нажимал «отправить», поле очищалось, и полминуты
 * ничего не происходило — оставалось гадать, ушло или нет, и половина людей
 * отправляла второй раз.
 *
 * Черновик собирается здесь, а не в компоненте: это то же самое DTO, что
 * придёт с сервера, и расходиться формой им нельзя — рисует их один и тот же
 * `ChatMessage`.
 */

/** Метка на временном идентификаторе: по ней сообщение отличают от настоящего. */
const PENDING_PREFIX = "pending:";

export function isPendingMessage(message: ChatMessageDto): boolean {
  return message.id.startsWith(PENDING_PREFIX);
}

export function pendingMessageId(seed: string): string {
  return `${PENDING_PREFIX}${seed}`;
}

/**
 * Черновик для показа.
 *
 * Автор — сам отправитель: сообщение рисуется как своё, с той же стороны и
 * тем же пузырём, что и через секунду. Вложения показываются без адресов:
 * файл уже загружен (композитор грузит его до отправки), но подписанная
 * ссылка придёт с сервера.
 */
export function buildPendingMessage(input: {
  seed: string;
  conversationId: string;
  author: ChatMessageDto["author"];
  body: string;
  attachments: ChatAttachmentInput[];
  replyTo: ChatMessageDto | null;
  now: Date;
}): ChatMessageDto {
  return {
    id: pendingMessageId(input.seed),
    conversationId: input.conversationId,
    author: input.author,
    body: input.body,
    attachments: input.attachments.map((attachment, index) => ({
      ...attachment,
      id: `${pendingMessageId(input.seed)}:${index}`,
      url: null,
    })),
    reactions: [],
    createdAt: input.now.toISOString(),
    replyTo: input.replyTo
      ? {
          id: input.replyTo.id,
          authorName: input.replyTo.author.name,
          body: input.replyTo.body,
          attachmentKind: input.replyTo.attachments[0]?.kind ?? null,
        }
      : null,
    // Прочитать ещё нечего: сообщение не доехало.
    readByOthers: false,
  };
}

/**
 * Заменить черновик пришедшим с сервера сообщением.
 *
 * Если то же сообщение уже прилетело по сокету раньше ответа на запрос —
 * черновик просто убирается: два одинаковых пузыря подряд выглядят как
 * двойная отправка, ровно то, чего человек и боялся.
 */
export function settlePendingMessage(
  messages: readonly ChatMessageDto[],
  pendingId: string,
  saved: ChatMessageDto,
): ChatMessageDto[] {
  const withoutPending = messages.filter((message) => message.id !== pendingId);
  return withoutPending.some((message) => message.id === saved.id)
    ? withoutPending
    : [...withoutPending, saved];
}

/** Убрать черновик, который не доехал. */
export function dropPendingMessage(
  messages: readonly ChatMessageDto[],
  pendingId: string,
): ChatMessageDto[] {
  return messages.filter((message) => message.id !== pendingId);
}
