import { createContext, useContext } from 'react';
import type { ChatGroupCallDto } from '@vedamatch/shared';
import type { GroupCallState } from './group-call-state';

/**
 * Контекст групповых звонков — отдельным файлом без тяжёлых зависимостей,
 * по тому же соображению, что и `chat-calls-context.ts`: провайдер тянет
 * WebRTC и `react-native-incall-manager`, а кнопке в шапке беседы нужен
 * только хук.
 */
export interface GroupCallsApi {
  state: GroupCallState;
  selfId: string;
  /** Идущий звонок в этой беседе (плашка «идёт звонок»), `null` — нет. */
  callInConversation: (conversationId: string) => ChatGroupCallDto | null;
  /**
   * Спросить сервер, идёт ли звонок в этой беседе. Нужно при ОТКРЫТИИ
   * беседы: события потока рассказывают только о том, что случилось при
   * нас, а звонок мог начаться, пока приложение было закрыто.
   */
  watchConversation: (conversationId: string) => void;
  /** Начать звонок в беседе или войти в уже идущий. */
  startOrJoin: (conversationId: string) => Promise<void>;
  /** Войти в конкретную комнату из плашки. */
  join: (callId: string) => Promise<void>;
  leave: () => Promise<void>;
  toggleMute: () => void;
  /** Экран группового звонка сообщает о своей видимости. */
  reportScreenMounted: (visible: boolean) => void;
  dismiss: () => void;
}

export const GroupCallsContext = createContext<GroupCallsApi | null>(null);

export function useGroupCalls(): GroupCallsApi | null {
  return useContext(GroupCallsContext);
}
