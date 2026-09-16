import type { CallPhase } from './call-machine';

/**
 * Что должно происходить с полноэкранным экраном звонка (`app/call/[id].tsx`)
 * по отношению к системному «назад» и когда показывать плашку «вернуться»
 * (`components/calls/return-to-call-banner.tsx`) — вынесено в чистые функции
 * со `spec`, а не раскидано по эффектам компонентов.
 *
 * Повод: `gan-harness/feedback/feedback-001.md`, блокирующий пункт 1 —
 * системное «назад» на Android снимает `call/[id].tsx` (`gestureEnabled` в
 * `react-native-screens` — iOS-only, `BackHandler` не был зарегистрирован),
 * а `CallSession` в `call-provider.tsx` жила дальше без какого-либо способа
 * вернуться. Решение — не блокировать «назад» и не спрашивать
 * подтверждения (это чужое для звонка трение), а сворачивать звонок в
 * плашку, как обычная звонилка сворачивается по «домой»: разговор не
 * прерывается, но виден и досягаем.
 */

/** Звонок ещё идёт (дозвон или разговор) — «назад» не должно его обрывать. */
const IN_PROGRESS_PHASES: ReadonlySet<CallPhase> = new Set(['outgoing', 'connecting', 'active']);

/**
 * «Назад» на экране звонка сворачивает разговор, а не завершает его, пока
 * идёт дозвон или сам разговор. У `ended` (и `idle`) сворачивать уже
 * нечего — экран просто закрывается, как обычно.
 */
export function backMinimizesCall(phase: CallPhase): boolean {
  return IN_PROGRESS_PHASES.has(phase);
}

/**
 * Показывать ли плашку «Идёт звонок — вернуться»: звонок жив, но его
 * полноэкранный экран сейчас не на виду (свернули «назад», ушли по пушу
 * или диплинку в другой раздел приложения).
 */
export function shouldShowReturnBanner(phase: CallPhase, screenVisible: boolean): boolean {
  return !screenVisible && IN_PROGRESS_PHASES.has(phase);
}
