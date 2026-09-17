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
 *
 * `ended` — особый случай (`feedback-003.md`): сам по себе он **не**
 * повод открывать экран, если тот ещё ни разу не поднимался для этого
 * звонка. Обычный входящий, который пропустили, который отменил звонящий
 * или на который ответили с другого устройства, должен просто убрать
 * баннер — полноэкранная карточка «Пропущенный звонок» на 3 секунды поверх
 * текущего раздела была бы навязчивой ради события, которое пользователь и
 * так не ждал. Экран всё же нужен, когда человек сам нажал «Ответить», а
 * дальше что-то не задалось до того, как успела появиться фаза `connecting`
 * (`answerAttempted`, например отказ в микрофоне — `call-provider.tsx`,
 * `accept()`): там причину финала обязательно нужно показать, иначе
 * нажатие «Ответить» осталось бы без всякого объяснения.
 */
export function shouldAutoNavigateToCallScreen(
  phase: CallPhase,
  callId: string | null,
  navigatedCallId: string | null,
  answerAttempted = false,
): boolean {
  if (!callId || navigatedCallId === callId) return false;
  if (phase === 'ended') return answerAttempted;
  return IN_PROGRESS_PHASES.has(phase);
}

/**
 * Метка `navigatedCallId` после смены фазы, если сама фаза больше ничего
 * не решает (`idle`/`incoming`) — экрану нечего показывать, память о
 * прошлом звонке никому не нужна (`feedback-003.md`, non-blocking №1,
 * `call-provider.tsx:488-489` раньше держал это внутри необтестированного
 * эффекта). Строго избыточно для корректности — сравнение `id` в
 * `shouldAutoNavigateToCallScreen` само отличает новый звонок от старого
 * независимо от того, обнулена метка или нет, — но так решение целиком
 * живёт в одном протестированном месте, а не «на всякий случай» в эффекте.
 */
export function navigatedCallIdAfterPhase(phase: CallPhase, current: string | null): string | null {
  return phase === 'idle' || phase === 'incoming' ? null : current;
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
