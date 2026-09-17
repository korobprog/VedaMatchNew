import { AppState, Platform } from 'react-native';
import type { ChatCallKind } from '@vedamatch/shared';
import VedamatchCalls, {
  type CallConflictState,
  type EndCallReason,
  type LaunchCall,
  type NetworkTransport,
} from '../../../modules/vedamatch-calls';
import { declineCallInBackground } from './background-call-action';
import { shouldDeclineAsBusy } from './call-busy-decision';
import { callLifecycleTracker } from './call-push-dedup';
import {
  decideIncomingCallPresentation,
  type CallDiscoverySource,
  type IncomingCallPresentationDecision,
} from './incoming-call-presentation';
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

/**
 * «Занято» (VED-222, п.7): проверяется ДО показа входящего — конфликт решает
 * `shouldDeclineAsBusy` (чистый модуль, `call-busy-decision.ts`) над сырыми
 * фактами `VedamatchCalls.callConflictState()`. Занятое устройство отклоняет
 * звонок ровно тем же путём, что и кнопка «Отклонить» из шторки
 * (`declineCallInBackground`, `background-call-action.ts`) — headless-совместимый
 * HTTP-запрос без открытия UI и без Telecom/уведомления вовсе: показывать и
 * тут же гасить звонок было бы хуже, чем не показать его совсем. Сервер не
 * различает причину отказа (`decline` без тела — см.
 * `docs/mobile-calls-native.md` §12, известное ограничение), это
 * недостаток контракта API, не этого клиента.
 */
interface IncomingCallInfo {
  callId: string;
  callerName: string;
  kind: ChatCallKind;
  avatarUrl?: string | null;
}

/**
 * Единая точка входа для «показать входящий», кем бы он ни был обнаружен —
 * пушем (фон/убитое приложение — `handleIncomingCallPush` ниже) или
 * `call.ringing` из общего потока, пока приложение живо (`call-provider.tsx`,
 * `showIncomingCallFromStream` ниже). VED-222, живая проверка BUG D: раньше
 * решение «нативный экран или свой JS-баннер» зависело от ТОГО, кто узнал о
 * звонке первым, — на заблокированном телефоне с живым процессом SSE
 * обгонял пуш, провайдер показывал баннер+рингтон ЗА экраном блокировки, а
 * нативный `showIncomingCall` не звался вовсе. Теперь оба пути сверяются с
 * `decideIncomingCallPresentation` (`incoming-call-presentation.ts`) по
 * фактическому `AppState`, а не по источнику; дедуп по `callId` —
 * `callLifecycleTracker`, общий для обоих путей, так что параллельный вызов
 * из push и SSE не поднимет Telecom дважды.
 */
async function presentIncomingCall(
  info: IncomingCallInfo,
  source: CallDiscoverySource,
  nowMs: number,
): Promise<IncomingCallPresentationDecision> {
  const decision = decideIncomingCallPresentation({
    appState: AppState.currentState,
    source,
    nativeShownFor: callLifecycleTracker.isRinging(info.callId, nowMs),
  });
  if (!decision.showNative) return decision;
  if (!SUPPORTED) return decision;
  if (callLifecycleTracker.handleIncoming(info.callId, nowMs) === 'duplicate') {
    // Параллельный вызов (push и SSE почти одновременно) уже поднял его.
    return { ...decision, showNative: false };
  }
  // `excludeCallId: info.callId` — правка по факту живой проверки (Samsung
  // Galaxy A51): без исключения своего же звонка повторно доставленный
  // push для звонка, на который человек в этот момент отвечает, читался
  // как «занято своим же звонком» и топил его decline'ом параллельно с
  // ответом изнутри приложения (`callConflictState`, `VedamatchCallsModule.kt`).
  const conflict = VedamatchCalls.callConflictState(info.callId);
  if (shouldDeclineAsBusy(conflict)) {
    // eslint-disable-next-line no-console -- диагностика для живого теста
    // (`console.warn` виден в logcat релизной сборки как `W ReactNativeJS`).
    console.warn('[calls] decline as busy', { callId: info.callId, ...conflict });
    void declineCallInBackground(info.callId);
    return { ...decision, showNative: false };
  }
  await VedamatchCalls.showIncomingCall({
    callId: info.callId,
    callerName: info.callerName,
    kind: info.kind,
    avatarUrl: info.avatarUrl,
  });
  return decision;
}

export async function handleIncomingCallPush(push: IncomingCallPush, nowMs = Date.now()): Promise<void> {
  if (!SUPPORTED) return;
  if (isIncomingCallExpired(push, nowMs)) return;
  await presentIncomingCall(
    { callId: push.callId, callerName: push.callerName, kind: push.kind, avatarUrl: push.callerAvatarUrl },
    'push',
    nowMs,
  );
}

/**
 * `call.ringing` из общего потока (`chat-stream.tsx`), пока приложение
 * живо, — `call-provider.tsx` зовёт это ДО (или вместо, если решение
 * скажет `showInAppUi: false`) обычного `dispatch`. На платформах без
 * нативного модуля (iOS) всегда возвращает «свой баннер» — там нет
 * альтернативы. `avatarUrl` — по контракту `ChatUserSummary`, `undefined`
 * трактуется как «нет фото», так же как и `null`.
 */
export async function showIncomingCallFromStream(
  info: IncomingCallInfo,
  nowMs = Date.now(),
): Promise<IncomingCallPresentationDecision> {
  if (!SUPPORTED) return { showNative: false, showInAppUi: true, playInAppRingtone: true };
  return presentIncomingCall(info, 'sse', nowMs);
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

/** VED-222, п.1: регистрирует ИСХОДЯЩИЙ звонок в Telecom
 *  (`TelecomManager.placeCall`) — вызывается один раз, когда `call-provider.tsx`
 *  переводит фазу в `outgoing`. Best-effort, как и входящий путь: провайдер
 *  не ждёт результата, WebRTC-дозвон от Telecom не зависит. */
export async function placeOutgoingCall(callId: string, calleeName: string, kind: ChatCallKind): Promise<void> {
  if (!SUPPORTED) return;
  await VedamatchCalls.placeOutgoingCall({ callId, callerName: calleeName, kind });
}

/** VED-222, п.1: разговор пошёл (`phase === 'active'`, обе роли) — пометить
 *  self-managed `Connection` активным (если он есть), поднять службу
 *  переднего плана с постоянным уведомлением «Идёт звонок» и начать слушать
 *  смену сети (`ice-restart-policy.ts` использует эти события только пока
 *  звонок в этой же фазе). */
export async function startOngoingCall(callId: string, companionName: string, kind: ChatCallKind): Promise<void> {
  if (!SUPPORTED) return;
  await VedamatchCalls.startOngoingCall({ callId, callerName: companionName, kind });
}

/** VED-222, п.7: сырые факты «занято ли устройство» — решение принимает
 *  `shouldDeclineAsBusy` (`call-busy-decision.ts`). На платформах без
 *  модуля — «свободно»: без него нет и self-managed интеграции, которая
 *  вообще может заметить конфликт. `excludeCallId` — не считать занятостью
 *  self-managed `Connection` этого же звонка (см. `handleIncomingCallPush`
 *  выше); для проверки перед НОВЫМ исходящим не передаётся вовсе. */
export function getCallConflictState(excludeCallId?: string): CallConflictState {
  if (!SUPPORTED) return { hasOwnCall: false, systemBusy: false };
  return VedamatchCalls.callConflictState(excludeCallId ?? '');
}

const KNOWN_TRANSPORTS: ReadonlySet<string> = new Set(['wifi', 'cellular', 'ethernet', 'other', 'none']);

function toNetworkTransport(value: string): NetworkTransport {
  return (KNOWN_TRANSPORTS.has(value) ? value : 'other') as NetworkTransport;
}

/** VED-222, п.6: подписка на смену транспорта активной сети — нативная
 *  сторона слушает только пока идёт разговор (`startOngoingCall`…`endCall`),
 *  здесь только доставка события в JS; решение «перезапускать ли ICE» —
 *  `ice-restart-policy.ts`. */
export function subscribeToNetworkTransportChanges(onChange: (transport: NetworkTransport) => void): () => void {
  if (!SUPPORTED) return () => undefined;
  const subscription = VedamatchCalls.addListener('networkTransportChanged', (payload: { transport: string }) =>
    onChange(toNetworkTransport(payload.transport)),
  );
  return () => subscription.remove();
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

/** VED-222, п.5: разрешить/запретить автоматический вход в картинку-в-картинке. */
export function setPipEligible(eligible: boolean): void {
  if (!SUPPORTED) return;
  VedamatchCalls.setPipEligible(eligible);
}

/** VED-222, п.5: вошли/вышли из PiP — `app/call/[id].tsx` прячет кнопки. */
export function subscribeToPipModeChanges(onChange: (inPip: boolean) => void): () => void {
  if (!SUPPORTED) return () => undefined;
  const subscription = VedamatchCalls.addListener('pipModeChanged', (payload: { inPip: boolean }) =>
    onChange(payload.inPip),
  );
  return () => subscription.remove();
}

export interface NativeCallEventHandlers {
  onAnswer: (callId: string) => void;
  onDecline: (callId: string) => void;
  /** VED-222: Telecom (гарнитура/Bluetooth/Android Auto во время разговора,
   *  преемption сотовым звонком) или кнопка «Завершить» на постоянном
   *  уведомлении разговора положили трубку системным путём. */
  onEnd: (callId: string) => void;
}

/** Ответ/отклонение/завершение системным путём (гарнитура, Bluetooth,
 *  Android Auto), пока JS жив, — см.
 *  `VedamatchConnection.onAnswer`/`onReject`/`onDisconnect`. Наша кнопка в
 *  уведомлении входящего отвечает напрямую и до `answer`/`decline` не
 *  доходит для убитого приложения (`CallActionReceiver.kt`); кнопка
 *  «Завершить» на уведомлении разговора, наоборот, всегда идёт через `end`,
 *  как и системные пути — один обработчик на «кто-то положил трубку не
 *  нашей кнопкой в самом экране звонка». */
export function subscribeToNativeCallEvents(handlers: NativeCallEventHandlers): () => void {
  if (!SUPPORTED) return () => undefined;
  const answer = VedamatchCalls.addListener('answer', (payload: { callId: string }) => handlers.onAnswer(payload.callId));
  const decline = VedamatchCalls.addListener('decline', (payload: { callId: string }) => handlers.onDecline(payload.callId));
  const end = VedamatchCalls.addListener('end', (payload: { callId: string }) => handlers.onEnd(payload.callId));
  return () => {
    answer.remove();
    decline.remove();
    end.remove();
  };
}
