"use client";

import { createContext, useContext } from "react";
import type { ChatGroupCallDto } from "@vedamatch/shared";
import type { GroupCallState } from "./group-call-state";

/**
 * Контекст групповых звонков — отдельным файлом без тяжёлых зависимостей,
 * чтобы кнопка в шапке беседы и плашка в переписке тянули за собой только
 * хук, а не весь провайдер с WebRTC.
 */
export interface GroupCallsApi {
  state: GroupCallState;
  selfId: string;
  /** Панель комнаты развёрнута (а не свёрнута в плашку). */
  expanded: boolean;
  /** Идущий звонок в этой беседе (плашка «идёт звонок»), `null` — нет. */
  callInConversation: (conversationId: string) => ChatGroupCallDto | null;
  /**
   * Спросить сервер, идёт ли звонок в этой беседе. Нужно при ОТКРЫТИИ
   * беседы: события потока рассказывают только о том, что случилось при
   * нас, а звонок мог начаться, пока вкладка была закрыта.
   */
  watchConversation: (conversationId: string) => void;
  /** Начать звонок в беседе или войти в уже идущий. */
  startOrJoin: (conversationId: string) => Promise<void>;
  /** Войти в конкретную комнату из плашки. */
  join: (callId: string) => Promise<void>;
  leave: () => Promise<void>;
  toggleMute: () => void;
  /** Свернуть панель в плашку / развернуть обратно. */
  setExpanded: (expanded: boolean) => void;
  dismiss: () => void;
}

export const GroupCallsContext = createContext<GroupCallsApi | null>(null);

export function useGroupCalls(): GroupCallsApi | null {
  return useContext(GroupCallsContext);
}
