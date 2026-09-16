import { NativeModule, requireNativeModule } from 'expo-modules-core';

/**
 * JS-обёртка нативного модуля `VedamatchCalls` (Kotlin,
 * `android/src/main/java/com/vedamatch/calls`). Self-managed
 * `ConnectionService` вместо `react-native-callkeep` — решение этапа 0
 * (`docs/mobile-calls-native.md`, §3): свой модуль под new architecture без
 * риска сломанных `@ReactMethod` из callkeep #822.
 *
 * Только Android — `expo-module.config.json` объявляет платформу явно,
 * `requireNativeModule` на iOS/вебе бросит на попытке использовать модуль,
 * поэтому вызывающий код (`native-call-bridge.ts`) сам проверяет `Platform.OS`.
 */

export type VedamatchCallKind = 'audio' | 'video';

export interface ShowIncomingCallOptions {
  callId: string;
  callerName: string;
  kind: VedamatchCallKind;
  /** `null`/не передан — модуль покажет заглушку без фото. */
  avatarUrl?: string | null;
}

/** Тот же набор, что `ChatCallEndedPushReason` в `@vedamatch/shared` —
 *  дублируется здесь: нативный модуль не имеет права импортировать
 *  серверные типы (контракт модулей — этот файл не про API портала, а про
 *  свой маленький Android-модуль). */
export type EndCallReason =
  | 'ended'
  | 'declined'
  | 'missed'
  | 'cancelled'
  | 'answered_elsewhere'
  | 'failed';

export type LaunchCallAction = 'answer' | 'open';

/** Чем приложение было поднято: ответом с уведомления/блокировки (сразу
 *  принять звонок) или обычным открытием/полноэкранным intent (показать
 *  как обычно — входящий баннер решит, что делать). */
export interface LaunchCall {
  callId: string;
  action: LaunchCallAction;
}

type VedamatchCallsEvents = {
  /** Ответ через системный путь (гарнитура, Bluetooth, Android Auto) —
   *  не через нашу кнопку в уведомлении, та отвечает напрямую и открывает
   *  приложение без этого события (см. `CallActionReceiver.kt`). */
  answer(payload: { callId: string }): void;
  /** Отклонение тем же системным путём, пока JS жив (передний план/фон, не
   *  убитое приложение — для убитого работает headless-задача, см.
   *  `decline-call-headless-task.ts`). */
  decline(payload: { callId: string }): void;
};

declare class VedamatchCallsNativeModule extends NativeModule<VedamatchCallsEvents> {
  /** Поднимает self-managed `ConnectionService` и показывает полноэкранное
   *  уведомление входящего звонка (`CallStyle.forIncomingCall` на Android 12+,
   *  обычные действия на более старых). Идемпотентно на нативной стороне
   *  для одного и того же `callId` не полагаемся — вызывающий код уже
   *  проверил дубликат через `callLifecycleTracker`. */
  showIncomingCall(options: ShowIncomingCallOptions): Promise<void>;
  /** Гасит уведомление/звонок по `callId`; безопасно звать даже если звонка
   *  уже нет (ответили/отменили) — no-op. */
  endCall(callId: string, reason: EndCallReason): Promise<void>;
  /** Синхронно: чем текущая `Activity` была поднята на этот раз. Одноразово
   *  — вызвавший код должен считать её использованной, повторный вызов до
   *  следующего запуска/`onNewIntent` вернёт `null`. */
  getLaunchCall(): LaunchCall | null;
  /** Android 14+: может ли приложение показать полноэкранный intent без
   *  ручного разрешения в настройках (`NotificationManager.canUseFullScreenIntent`).
   *  На более старых версиях всегда `true` — разрешение появилось только в 14. */
  canUseFullScreenIntent(): boolean;
  /** Открывает системный экран разрешения полноэкранных уведомлений. */
  openFullScreenIntentSettings(): void;
  /** Держать экран поверх блокировки и не гасить его, пока открыт экран
   *  звонка (`app/call/[id].tsx`) — `Activity.setShowWhenLocked`/`setTurnScreenOn`,
   *  снимается по `active: false` при уходе с экрана. */
  setCallScreenActive(active: boolean): void;
}

const VedamatchCalls = requireNativeModule<VedamatchCallsNativeModule>('VedamatchCalls');
export default VedamatchCalls;
