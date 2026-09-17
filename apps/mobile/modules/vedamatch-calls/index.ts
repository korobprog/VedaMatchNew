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

/** Аргумент `placeOutgoingCall`/`startOngoingCall` (VED-222) — те же три
 *  поля, что у входящего, без аватара: уведомлению разговора фото не нужно. */
export interface OngoingCallOptions {
  callId: string;
  callerName: string;
  kind: VedamatchCallKind;
}

/** Сырые факты для решения «занято» (VED-222, п.7) — сама логика решения
 *  («занято ли устройство») живёт в JS, чистым модулем со своим спеком
 *  (`src/lib/calls/call-busy-decision.ts`), а не здесь: этот тип — только
 *  форма ответа нативной стороны. */
export interface CallConflictState {
  /** Уже идёт свой self-managed звонок VedaMatch (`PendingCallStore`). */
  hasOwnCall: boolean;
  /** Telecom считает устройство занятым чем-то ещё — сотовым разговором или
   *  другим self-managed приложением (`TelecomManager.isInCall()`). */
  systemBusy: boolean;
}

/** Транспорт активной сети — сырой факт для `ice-restart-policy.ts`
 *  (VED-222, п.6): решение «перезапускать ли ICE прямо сейчас» модуль не
 *  принимает сам, только репортит смену. */
export type NetworkTransport = 'wifi' | 'cellular' | 'ethernet' | 'other' | 'none';

type VedamatchCallsEvents = {
  /** Ответ через системный путь (гарнитура, Bluetooth, Android Auto) —
   *  не через нашу кнопку в уведомлении, та отвечает напрямую и открывает
   *  приложение без этого события (см. `CallActionReceiver.kt`). */
  answer(payload: { callId: string }): void;
  /** Отклонение тем же системным путём, пока JS жив (передний план/фон, не
   *  убитое приложение — для убитого работает headless-задача, см.
   *  `decline-call-headless-task.ts`). */
  decline(payload: { callId: string }): void;
  /** VED-222: Telecom (гарнитура/Bluetooth/Android Auto — `Connection.onDisconnect`,
   *  преемption сотовым звонком) или наша кнопка «Завершить» на постоянном
   *  уведомлении разговора (`CallActionReceiver`, `com.vedamatch.calls.END`)
   *  положили трубку системным путём — не через кнопку в самом приложении. */
  end(payload: { callId: string }): void;
  /** VED-222, п.6: сменился основной транспорт активной сети, пока модуль
   *  слушает (`startOngoingCall`…`endCall` — только во время разговора). */
  networkTransportChanged(payload: { transport: string }): void;
  /** VED-222, п.5: `MainActivity.onPictureInPictureModeChanged` — вошли/
   *  вышли из картинки-в-картинке. */
  pipModeChanged(payload: { inPip: boolean }): void;
};

declare class VedamatchCallsNativeModule extends NativeModule<VedamatchCallsEvents> {
  /** Поднимает self-managed `ConnectionService` и показывает полноэкранное
   *  уведомление входящего звонка (`CallStyle.forIncomingCall` на Android 12+,
   *  обычные действия на более старых). Идемпотентно на нативной стороне
   *  для одного и того же `callId` не полагаемся — вызывающий код уже
   *  проверил дубликат через `callLifecycleTracker`. */
  showIncomingCall(options: ShowIncomingCallOptions): Promise<void>;
  /** VED-222: регистрирует ИСХОДЯЩИЙ звонок в Telecom
   *  (`TelecomManager.placeCall` для self-managed аккаунта) — система должна
   *  знать о разговоре так же, как про входящий. Best-effort: WebRTC-дозвон
   *  (`call-provider.tsx`) не ждёт и не зависит от результата. */
  placeOutgoingCall(options: OngoingCallOptions): Promise<void>;
  /** VED-222: разговор пошёл (`phase === 'active'`, для обеих ролей) —
   *  перевести существующий self-managed `Connection` в активное состояние
   *  (если он был зарегистрирован — см. `docs/mobile-calls-native.md` §12,
   *  известное ограничение для звонка, отвеченного целиком внутри уже
   *  открытого приложения), поднять службу переднего плана с постоянным
   *  уведомлением «Идёт звонок» и начать слушать смену сети. */
  startOngoingCall(options: OngoingCallOptions): Promise<void>;
  /** Гасит уведомление/звонок по `callId` — и входящий, и постоянное
   *  уведомление разговора, и слежение за сетью; безопасно звать даже если
   *  звонка уже нет (ответили/отменили) — no-op. */
  endCall(callId: string, reason: EndCallReason): Promise<void>;
  /** Синхронно: чем текущая `Activity` была поднята на этот раз. Одноразово
   *  — вызвавший код должен считать её использованной, повторный вызов до
   *  следующего запуска/`onNewIntent` вернёт `null`. */
  getLaunchCall(): LaunchCall | null;
  /** VED-222, п.7: сырые факты «занято ли устройство» — см. `CallConflictState`.
   *  `excludeCallId` — правка по факту живой проверки (Samsung Galaxy A51):
   *  свой self-managed `Connection` для ЭТОГО ЖЕ звонка (уже звонит/уже
   *  отвечен) не считается занятостью — иначе повторно доставленный push
   *  `call.incoming` для звонка, на который человек в этот момент отвечает,
   *  топит его decline'ом как «занято своим же звонком». Пустая строка —
   *  «нет своего звонка, который надо бы исключить» (обычная проверка перед
   *  НОВЫМ исходящим); не `string | undefined`, чтобы не зависеть от того,
   *  как именно мост expo-modules-core сводит пропущенный JS-аргумент с
   *  необязательным параметром на стороне Kotlin. */
  callConflictState(excludeCallId: string): CallConflictState;
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
  /** VED-222, п.5: можно ли сейчас автоматически войти в картинку-в-картинке
   *  при уходе из приложения (только видеозвонок, `active`, экран открыт). */
  setPipEligible(eligible: boolean): void;
}

const VedamatchCalls = requireNativeModule<VedamatchCallsNativeModule>('VedamatchCalls');
export default VedamatchCalls;
