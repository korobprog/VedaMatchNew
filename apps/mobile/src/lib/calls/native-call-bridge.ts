import { Platform } from 'react-native';
import VedamatchCalls, { type EndCallReason, type LaunchCall } from '../../../modules/vedamatch-calls';
import { callLifecycleTracker } from './call-push-dedup';
import { isIncomingCallExpired, type CallEndedPush, type IncomingCallPush } from './incoming-call-push';

/**
 * Мост между разобранным data-пушем (`incoming-call-push.ts`) и нативным
 * модулем (`modules/vedamatch-calls`) — тонкий, сам не парсит и не решает,
 * держит только «звать нативный модуль или нет» (дедуп/просрочка) и
 * платформенную проверку. Единственная точка входа для обоих путей: фонового
 * обработчика (`index.js` → `setBackgroundMessageHandler`) и переднего плана
 * (`push-bridge.tsx` → `messaging().onMessage`) — оба вызывают ровно эти
 * функции, а не трогают `VedamatchCalls`/`callLifecycleTracker` напрямую,
 * иначе дедуп между путями не сработает.
 *
 * Только Android: `expo-module.config.json` модуля объявляет платформу явно,
 * `requireNativeModule` на iOS бросит на первом обращении — здесь это
 * оборачивается проверкой `Platform.OS`, а не try/catch.
 */

const SUPPORTED = Platform.OS === 'android';

const END_REASONS: ReadonlySet<string> = new Set([
  'ended',
  'declined',
  'missed',
  'cancelled',
  'answered_elsewhere',
  'failed',
]);

function toEndReason(reason: string): EndCallReason {
  return (END_REASONS.has(reason) ? reason : 'ended') as EndCallReason;
}

export async function handleIncomingCallPush(push: IncomingCallPush, nowMs = Date.now()): Promise<void> {
  if (!SUPPORTED) return;
  if (isIncomingCallExpired(push, nowMs)) return;
  if (callLifecycleTracker.handleIncoming(push.callId, nowMs) === 'duplicate') return;
  await VedamatchCalls.showIncomingCall({
    callId: push.callId,
    callerName: push.callerName,
    kind: push.kind,
    avatarUrl: push.callerAvatarUrl,
  });
}

export async function handleCallEndedPush(push: CallEndedPush, nowMs = Date.now()): Promise<void> {
  if (!SUPPORTED) return;
  if (callLifecycleTracker.handleEnded(push.callId, nowMs) === 'duplicate') return;
  await VedamatchCalls.endCall(push.callId, toEndReason(push.reason));
}

/** Нативная сторона положила звонок сама (WebRTC/провайдер уже знает) —
 *  снять уведомление и self-managed `Connection`, если ещё живы. Тот же
 *  вызов, что и по data-пушу «звонок снят», но без сети: используется, когда
 *  само приложение (не сервер) решает, что разговор кончен. */
export async function clearNativeCall(callId: string, reason: EndCallReason): Promise<void> {
  if (!SUPPORTED) return;
  await VedamatchCalls.endCall(callId, reason);
}

/** Чем сейчас поднята `Activity» — читается один раз при старте
 *  (`call-provider.tsx`): «answer» значит нативная кнопка уже перевела
 *  self-managed `Connection` в активную, провайдеру остаётся вызвать
 *  `accept()` без второго нажатия. */
export function consumeLaunchCall(): LaunchCall | null {
  if (!SUPPORTED) return null;
  return VedamatchCalls.getLaunchCall();
}

export function canUseFullScreenIntent(): boolean {
  if (!SUPPORTED) return true;
  return VedamatchCalls.canUseFullScreenIntent();
}

export function openFullScreenIntentSettings(): void {
  if (!SUPPORTED) return;
  VedamatchCalls.openFullScreenIntentSettings();
}

/** Держать экран поверх блокировки, пока открыт `app/call/[id].tsx`. */
export function setCallScreenActive(active: boolean): void {
  if (!SUPPORTED) return;
  VedamatchCalls.setCallScreenActive(active);
}

export interface NativeCallEventHandlers {
  onAnswer: (callId: string) => void;
  onDecline: (callId: string) => void;
}

/** Ответ/отклонение системным путём (гарнитура, Bluetooth, Android Auto),
 *  пока JS жив, — см. `VedamatchConnection.onAnswer`/`onReject`. Наша кнопка
 *  в уведомлении отвечает напрямую и до этих событий не доходит для
 *  убитого приложения (`CallActionReceiver.kt`). */
export function subscribeToNativeCallEvents(handlers: NativeCallEventHandlers): () => void {
  if (!SUPPORTED) return () => undefined;
  const answer = VedamatchCalls.addListener('answer', (payload: { callId: string }) => handlers.onAnswer(payload.callId));
  const decline = VedamatchCalls.addListener('decline', (payload: { callId: string }) => handlers.onDecline(payload.callId));
  return () => {
    answer.remove();
    decline.remove();
  };
}
