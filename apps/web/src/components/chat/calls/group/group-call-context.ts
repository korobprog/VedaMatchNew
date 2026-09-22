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
  /** Человек хочет камеру включённой (кнопка). */
  cameraOn: boolean;
  /**
   * Картинка реально уходит. Отличается от `cameraOn`, когда вкладку
   * увели: место под видео за нами остаётся, кадры не идут
   * (`group-video-state.ts`).
   */
  sendingVideo: boolean;
  /** Включить/выключить камеру. Может закончиться отказом сервера. */
  toggleCamera: () => Promise<void>;
  /** Своя картинка — для плитки «вы». `null`, когда камера не снимает. */
  localVideoStream: MediaStream | null;
  /** Потоки собеседников: из них берутся и звук, и картинка. */
  remoteStreams: Record<string, MediaStream>;
  /** Кто сообщил, что сейчас не снимает (скрыл вкладку, выключил камеру). */
  remoteVideoOff: Record<string, boolean>;
  /** Отказ прочитан. */
  clearActionError: () => void;
  /** Свернуть панель в плашку / развернуть обратно. */
  setExpanded: (expanded: boolean) => void;
  dismiss: () => void;
}

export const GroupCallsContext = createContext<GroupCallsApi | null>(null);

export function useGroupCalls(): GroupCallsApi | null {
  return useContext(GroupCallsContext);
}
