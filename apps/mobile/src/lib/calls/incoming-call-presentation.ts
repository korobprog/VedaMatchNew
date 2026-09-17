import type { AppStateStatus } from 'react-native';

/**
 * Кто первым узнал о входящем — пуш (`background-handler.ts`/`push-bridge.tsx`)
 * или общий поток (`call.ringing`, `chat-stream.tsx`). Решение (см. ниже)
 * сознательно НЕ зависит от этого поля — держим его только для трассировки
 * в диагностике вызывающего кода: живая проверка BUG D (VED-222) как раз и
 * состояла в том, что решение раньше ЗАВИСЕЛО от источника («пуш → нативный
 * путь, SSE → свой баннер»), а не от того, виден ли вообще экран.
 */
export type CallDiscoverySource = 'push' | 'sse';

export interface IncomingCallPresentationInput {
  /** `AppState.currentState` в момент решения. */
  appState: AppStateStatus;
  source: CallDiscoverySource;
  /** Уже показан ли нативный входящий (Telecom `Connection` + полноэкранный
   *  intent) для ЭТОГО `callId` — хранит и проверяет вызывающий код
   *  (`callLifecycleTracker`, `call-push-dedup.ts`), здесь только решение. */
  nativeShownFor: boolean;
}

export interface IncomingCallPresentationDecision {
  /** Позвать `VedamatchCalls.showIncomingCall` (self-managed `Connection` +
   *  полноэкранный intent, переживает блокировку/фон). */
  showNative: boolean;
  /** Поднять `phase: 'incoming'` в `call-machine.ts` — баннер/экран внутри
   *  приложения. */
  showInAppUi: boolean;
  /** Играть внутриприложенческий рингтон (`startRingtone`). */
  playInAppRingtone: boolean;
}

/**
 * VED-222, живая проверка BUG D: заблокированный телефон, процесс жив,
 * поток событий подключён — `call.ringing` дошёл по SSE раньше пуша,
 * провайдер поднял свой баннер и включил рингтон (ExoPlayer держал wake
 * lock 44 с) ЗА экраном блокировки, где их никто не видел и не слышал
 * настоящим звонком, — а нативный `showIncomingCall` вовсе не вызывался,
 * потому что решение «нативный экран или свой баннер» раньше зависело от
 * ТОГО, ЧЕРЕЗ ЧТО узнали о звонке (пуш → нативный путь, SSE → свой баннер),
 * а не от того, виден ли вообще экран приложения. Пуш в переднем плане (по
 * классификации FCM) тоже ненадёжен тем же способом — `isAppInForeground`
 * у `@react-native-firebase/messaging` смотрит на важность процесса, не на
 * то, разблокирован ли экран.
 *
 * Правило простое и не зависит от `source`: не на переднем плане
 * (`appState !== 'active'`, включая заблокированный/погашенный экран) —
 * ВСЕГДА нативный путь (с дедупом по `callId`, чтобы push и SSE не подняли
 * его дважды), свой баннер/рингтон в фоне не включаются вовсе — там их
 * всё равно не видно и не слышно как надо, только держат разряжающий
 * батарею wake lock. На переднем плане — привычный баннер+рингтон, а
 * нативный поднимаем, только если он ЕЩЁ не шёл (иначе повторно
 * доставленный пуш после уже открытого баннера позвал бы Telecom поверх
 * уже видимого приложения без нужды); симметрично — баннер/рингтон на
 * переднем плане пропускаются, если нативный уже показан (не дублируем
 * тем же способом в другую сторону — например, вернулись в приложение,
 * пока Telecom уже показывает системный экран).
 */
export function decideIncomingCallPresentation(
  input: IncomingCallPresentationInput,
): IncomingCallPresentationDecision {
  const foreground = input.appState === 'active';
  if (!foreground) {
    return { showNative: !input.nativeShownFor, showInAppUi: false, playInAppRingtone: false };
  }
  const alreadyNative = input.nativeShownFor;
  return { showNative: false, showInAppUi: !alreadyNative, playInAppRingtone: !alreadyNative };
}
