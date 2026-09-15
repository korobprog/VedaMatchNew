import type { ChatMessageDto } from '@vedamatch/shared';
import { isPendingMessage } from './chat-room-state';

/**
 * Какие пункты меню долгого нажатия доступны для сообщения. Само меню
 * открывается только для неудалённых и не отправляющихся сообщений
 * (`message-bubble.tsx`) — здесь решается только состав пунктов внутри.
 */
export interface MessageActionFlags {
  /** «Ответить» — всегда, кроме отправляющегося и удалённого. */
  reply: boolean;
  /** «Копировать текст» — только если есть текст. */
  copy: boolean;
  /** «Изменить» — только своё текстовое сообщение. */
  edit: boolean;
  /** «Удалить» — только своё, ещё не удалённое сообщение. */
  delete: boolean;
}

export function messageActionFlags(message: ChatMessageDto, myUserId: string): MessageActionFlags {
  const deleted = Boolean(message.deletedAt);
  const pending = isPendingMessage(message);
  const mine = message.author.id === myUserId;
  const hasBody = Boolean(message.body);
  return {
    reply: !deleted && !pending,
    copy: !deleted && hasBody,
    edit: mine && !deleted && hasBody,
    delete: mine && !deleted,
  };
}
