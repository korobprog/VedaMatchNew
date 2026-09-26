import { createContext, useContext } from 'react';
import type { MediaStream } from 'react-native-webrtc';
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
  /** Человек хочет камеру включённой (кнопка). */
  cameraOn: boolean;
  /**
   * Картинка реально уходит. Отличается от `cameraOn`, когда приложение в
   * фоне: место под видео за нами остаётся, кадры не идут
   * (`group-video-state.ts`).
   */
  sendingVideo: boolean;
  /** Своя картинка — для плитки «вы». `null`, когда камера не снимает. */
  localVideoStream: MediaStream | null;
  /** Включить/выключить камеру. Может закончиться отказом сервера. */
  toggleCamera: () => Promise<void>;
  /** Передняя/задняя камера. */
  switchCamera: () => void;
  /** Потоки собеседников — из них экран берёт картинку. */
  remoteStreams: Record<string, MediaStream>;
  /** Кто сообщил, что сейчас не снимает (свернул приложение, выключил камеру). */
  remoteVideoOff: Record<string, boolean>;
  /** Открыто окно «картинка в картинке» — экран прячет кнопки. */
  pipActive: boolean;
  /** Отказ прочитан. */
  clearActionError: () => void;
  /** Экран группового звонка сообщает о своей видимости. */
  reportScreenMounted: (visible: boolean) => void;
  dismiss: () => void;
  /**
   * Сводка видео по каждой паре словами, без имён и id
   * (`group-video-link.ts`). Открывается долгим нажатием на заголовок
   * экрана звонка — для разбора чёрной плитки на релизной сборке.
   */
  videoDiagnostics: () => Promise<string>;
}

export const GroupCallsContext = createContext<GroupCallsApi | null>(null);

export function useGroupCalls(): GroupCallsApi | null {
  return useContext(GroupCallsContext);
}
