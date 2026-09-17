import type { ChatConversationKind } from '@vedamatch/shared';

/**
 * Можно ли звонить в этой беседе — те же правила, что у сообщения
 * (`apps/web/src/components/chat/chat-room.tsx`: кнопки видны только для
 * `direct` c собеседником, активны только когда можно писать).
 */
export function canStartCall(conversation: {
  kind: ChatConversationKind;
  companion?: { id: string } | null;
  canWrite: boolean;
}): boolean {
  return conversation.kind === 'direct' && Boolean(conversation.companion) && conversation.canWrite;
}

/** Кнопки видны для личной беседы всегда — блокируется только нажатие. */
export function showCallButtons(conversation: {
  kind: ChatConversationKind;
  companion?: { id: string } | null;
}): boolean {
  return conversation.kind === 'direct' && Boolean(conversation.companion);
}
