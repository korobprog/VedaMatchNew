import type { ChatAttachmentDto } from '@vedamatch/shared';
import { useChatCalls } from '@/lib/calls/chat-calls-context';
import { shouldInterruptForIncomingCall } from '@/lib/chat/voice/voice-call-guard';
import { VoiceMessageErrorBoundary } from './voice-message-error-boundary';
import { VoiceMessagePlayer } from './voice-message-player';

/**
 * Голосовое вложение в пузыре: подписка на звонок и защита от падения
 * плеера живут здесь, а не в `message-bubble.tsx` — иначе `useChatCalls()`
 * вызывался бы для КАЖДОГО пузыря в ленте (текст, фото), а не только для
 * тех, где реально есть голосовое (feedback-001, минор п.6).
 */
interface Props {
  attachment: ChatAttachmentDto;
  /** Позиция в переписке для автоперехода (VED-289) — см. `message-bubble.tsx`. */
  order: number;
}

export function VoiceMessageAttachment({ attachment, order }: Props) {
  const calls = useChatCalls();
  const interrupted = calls ? shouldInterruptForIncomingCall(calls.state.phase) : false;
  return (
    <VoiceMessageErrorBoundary>
      <VoiceMessagePlayer attachment={attachment} interrupted={interrupted} order={order} />
    </VoiceMessageErrorBoundary>
  );
}
