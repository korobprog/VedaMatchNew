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

/**
 * Фазы, при которых у звонка вообще должен быть полноэкранный вид —
 * `ended` включён отдельно от «живых» `IN_PROGRESS_PHASES`: экран нужен и
 * когда звонок уже закончился, но ещё ни разу не открывался (например,
 * отказ в микрофоне при «Ответить» — `call-provider.tsx`, `accept()` —
 * сразу даёт `ended` с причиной, которую надо показать).
 */
const SCREEN_PHASES: ReadonlySet<CallPhase> = new Set(['outgoing', 'connecting', 'active', 'ended']);

/**
 * Пушить ли `/call/[id]` прямо сейчас — решение эффекта-автонавигатора в
 * `call-provider.tsx`, вынесенное в чистую функцию (`feedback-002.md`,
 * блокирующий пункт 1). Один раз на звонок: если для этого `callId` экран
 * уже поднимался хоть раз (`navigatedCallId === callId`) — не поднимать
 * снова. Это и есть весь механизм «после «назад» никаких автопереходов до
 * конца звонка»: смена фазы (собеседник ответил, пока пользователь ушёл в
 * другой раздел, — `call-machine.ts`, `reduceStream`) сама по себе не
 * повод выдёргивать человека на полный экран, если он его уже видел и
 * сам свернул. `navigatedCallId` при этом не сбрасывается на «назад»
 * (`nextNavigatedCallId` ниже) — сбрасывать его при уходе с экрана и было
 * причиной гонки.
 */
export function shouldAutoNavigateToCallScreen(
  phase: CallPhase,
  callId: string | null,
  navigatedCallId: string | null,
): boolean {
  if (!callId || navigatedCallId === callId) return false;
  return SCREEN_PHASES.has(phase);
}

/**
 * Новое значение метки `navigatedCallId` после того, как экран звонка
 * сообщил о своей видимости (`reportCallScreenMounted`) — не важно, кто её
 * вызвал: автонавигатор, плашка «вернуться» (прямой `router.push` в обход
 * провайдера) или будущий deep link. Появился на экране — звонок «уже
 * открыт», метка встаёт на его `callId`. Ушёл с экрана — это **не**
 * «звонок больше не открывался»: если сбросить метку в `null` здесь (как
 * было раньше), следующая смена фазы («назад» → собеседник ответил, пока
 * пользователь в другом разделе) увидит «звонок ещё не показывали» и
 * принудительно откроет экран заново — ровно баг feedback-002.md. Поэтому
 * при уходе метка остаётся как есть.
 */
export function nextNavigatedCallId(
  screenVisible: boolean,
  callId: string | null,
  previousNavigatedCallId: string | null,
): string | null {
  return screenVisible ? callId : previousNavigatedCallId;
}
