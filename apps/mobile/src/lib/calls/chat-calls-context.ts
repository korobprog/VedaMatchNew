import { createContext, useContext } from 'react';
import type { ChatCallKind } from '@vedamatch/shared';
import type { MediaStream } from 'react-native-webrtc';
import type { CallState } from './call-machine';

/**
 * Контекст звонков — вынесен из `call-provider.tsx` в отдельный файл без
 * тяжёлых зависимостей (веха «Скорость», доп. заход): `call-provider.tsx`
 * тянет WebRTC-сессию, `expo-audio` (рингтоны) и `react-native-incall-
 * manager` — на вебе это лишний вес для гостя, у которого звонков не
 * бывает вовсе (`root-shell.web.tsx` грузит сам провайдер отдельным чанком
 * только для вошедших). Раньше `useChatCalls` жил в том же файле, что и
 * провайдер, — любой компонент, которому нужен был только хук (кнопка
 * звонка в шапке чата, баннеры, экран звонка), синхронно тянул за собой
 * весь модуль целиком, сводя разделение на чанки к нулю. Импортировать
 * `useChatCalls` теперь нужно отсюда, а не из `call-provider.tsx`.
 */
export interface ChatCallsApi {
  state: CallState;
  selfId: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  /** Пошёл ли разговор через TURN — обновляется, пока `phase === 'active'`. */
  relayed: boolean | null;
  /**
   * Включена ли камера у собеседника (VED-291). Пока он молчит — считаем,
   * что включена: клиент, не знающий про сигнал `media` (сайт до своей
   * правки), не шлёт его вовсе, и его видео должно показываться как
   * раньше. `media-state-signal.ts`.
   */
  remoteVideoOn: boolean;
  /**
   * Уходит ли прямо сейчас наша картинка. Это НЕ просто `!state.cameraOff`:
   * в фоне без «картинки в картинке» камера гасится ради батареи
   * (`video-track-state.ts`), а кнопка при этом остаётся в прежнем
   * положении — человек её не трогал.
   */
  sendingVideo: boolean;
  /** Открыто окно «картинка в картинке» — в нём экран звонка прячет всё, кроме видео. */
  pipActive: boolean;
  /**
   * Открыт ли сейчас полноэкранный `app/call/[id].tsx`. Системное «назад»
   * снимает этот экран (feedback-001.md, блокирующий пункт 1), но не
   * завершает звонок — `screenVisible` даёт `ReturnToCallBanner` понять,
   * что показать плашку «вернуться» (`call-screen-return.ts`).
   */
  screenVisible: boolean;
  /** Экран звонка вызывает при монтировании/размонтировании. */
  reportCallScreenMounted: (visible: boolean) => void;
  start: (conversationId: string, kind: ChatCallKind) => Promise<void>;
  accept: () => Promise<void>;
  decline: () => Promise<void>;
  hangUp: () => Promise<void>;
  toggleMute: () => void;
  toggleCamera: () => void;
  switchCamera: () => void;
  dismiss: () => void;
}

export const ChatCallsContext = createContext<ChatCallsApi | null>(null);

export function useChatCalls(): ChatCallsApi | null {
  return useContext(ChatCallsContext);
}
