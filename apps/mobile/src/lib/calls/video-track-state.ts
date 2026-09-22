import type { ChatCallKind } from '@vedamatch/shared';
import type { CallPhase } from './call-machine';

/**
 * Что происходит с видео (VED-291): отправляем ли мы свою картинку прямо
 * сейчас и что показывать на экране звонка. Чистые решения — вся мимика
 * экрана и работа с дорожками в `call-provider.tsx`/`app/call/[id].tsx`
 * сводится к вызову этих функций.
 *
 * Свернули приложение — камеру гасим. Кодирование видео на Samsung A51 —
 * самая дорогая часть звонка по батарее и нагреву, а пока приложение в
 * фоне, свою картинку всё равно никто не смотрит: собеседник видит либо
 * окно «картинка в картинке» (тогда мы на переднем плане по смыслу и
 * продолжаем снимать), либо ничего. На Android камера в фоне вдобавок
 * отбирается системой у приложений без соответствующего foreground-типа —
 * разговор от этого не падает, но кадры всё равно перестают идти, только
 * молча. Выключаем явно и сообщаем собеседнику (`media-state-signal.ts`),
 * чтобы он видел заглушку, а не замёрзший кадр.
 */

export interface VideoSendInput {
  kind: ChatCallKind;
  phase: CallPhase;
  /** Кнопка «камера» на экране звонка. */
  cameraOff: boolean;
  /** `AppState` приложения — `'active'` значит «на переднем плане». */
  appState: 'active' | 'background' | 'inactive';
  /** Открыто окно «картинка в картинке» (`native-call-bridge.ts`). */
  pipActive: boolean;
}

/**
 * Отправляем ли мы свою картинку.
 *
 * `'inactive'` (iOS-переходное состояние, шторка уведомлений/переключатель
 * приложений) камеру не гасит: это доли секунды, а моргать картинкой у
 * собеседника из-за свайпа по шторке — хуже, чем чуть дольше покодировать.
 */
export function shouldSendVideo({
  kind,
  phase,
  cameraOff,
  appState,
  pipActive,
}: VideoSendInput): boolean {
  if (kind !== 'video') return false;
  if (phase !== 'connecting' && phase !== 'active') return false;
  if (cameraOff) return false;
  if (appState === 'background' && !pipActive) return false;
  return true;
}

/** Что на «сцене» экрана звонка — большое видео собеседника или его карточка. */
export type CallStageView = 'remote-video' | 'companion';

export interface StageInput {
  kind: ChatCallKind;
  phase: CallPhase;
  hasRemoteStream: boolean;
  /** Что собеседник сообщил о своей камере (`media-state-signal.ts`). */
  remoteVideoOn: boolean;
}

/**
 * Видео собеседника показываем, только когда разговор реально идёт, поток
 * пришёл и собеседник не сказал, что выключил камеру. Иначе — карточка с
 * аватаром и именем: чёрный прямоугольник вместо неё читается как поломка.
 */
export function stageView({ kind, phase, hasRemoteStream, remoteVideoOn }: StageInput): CallStageView {
  if (kind !== 'video') return 'companion';
  if (phase !== 'active') return 'companion';
  if (!hasRemoteStream) return 'companion';
  return remoteVideoOn ? 'remote-video' : 'companion';
}

/** Маленькое окно со своей картинкой в углу. */
export type LocalPreviewView = 'video' | 'placeholder' | 'none';

export interface LocalPreviewInput {
  kind: ChatCallKind;
  phase: CallPhase;
  hasLocalStream: boolean;
  /** Реально ли уходит картинка — результат `shouldSendVideo`. */
  sendingVideo: boolean;
  /** В окне «картинка в картинке» лишнего не показываем. */
  pipActive: boolean;
}

/**
 * `placeholder` вместо `video` — когда камера своя выключена (кнопкой или
 * потому, что приложение в фоне): раньше превью просто делалось прозрачным
 * (`opacity: 0`), и на его месте проступало видео собеседника, обрезанное
 * рамкой окошка, — выглядело как дефект отрисовки. Заглушка с перечёркнутой
 * камерой прямо говорит, что происходит.
 */
export function localPreviewView({
  kind,
  phase,
  hasLocalStream,
  sendingVideo,
  pipActive,
}: LocalPreviewInput): LocalPreviewView {
  if (kind !== 'video' || pipActive) return 'none';
  if (phase === 'ended' || phase === 'idle') return 'none';
  if (!hasLocalStream) return 'none';
  return sendingVideo ? 'video' : 'placeholder';
}
