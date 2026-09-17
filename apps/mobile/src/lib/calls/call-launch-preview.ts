import type { ChatCallDto, ChatCallKind } from '@vedamatch/shared';
import type { LaunchCall } from '../../../modules/vedamatch-calls';

/**
 * Собрать «карточку предпросмотра» входящего звонка из данных
 * `getLaunchCall()` (VED-222, живая проверка BUG B): `fullScreenIntent`
 * поднимает `Activity` поверх блокировки раньше, чем `reconcile()`
 * (`GET /chat/calls/active`) успевает сходить на сервер, — до этого момента
 * показывать нечего, входящий баннер молчит, а звонок уходит в пропущенные.
 * `PendingCallStore` (нативная сторона) уже знает имя/вид/аватар из пуша,
 * которым запустил `showIncomingCall` — этого достаточно, чтобы нарисовать
 * `IncomingCallBanner`, не дожидаясь сети.
 *
 * Не настоящий `ChatCallDto` с сервера: `conversationId` неизвестен
 * нативной стороне, `caller.id` — намеренный плейсхолдер (не должен
 * совпадать с `selfId`, чтобы `roleIn()`/`companionOf()` не спутали нас с
 * собеседником). Как только `reconcile()` получит настоящий объект,
 * `call-provider.tsx` заменит эту карточку им целиком (см. `callIsPreview`
 * в `call-machine.ts`) — поля вроде `conversationId` до вызова `accept()`
 * нигде не читаются.
 */
export const LAUNCH_PREVIEW_CALLER_ID = 'native-launch-preview';

/** `null`, если в `LaunchCall` не хватает данных для показа (старое
 *  нативное приложение без `callerName`/`kind` в ответе `getLaunchCall`,
 *  или `action !== 'open'` — вызывающий код это тоже проверяет сам). */
export function buildLaunchPreviewCall(launch: LaunchCall, selfId: string): ChatCallDto | null {
  if (!launch.callerName || !launch.kind) return null;
  const kind: ChatCallKind = launch.kind === 'video' ? 'video' : 'audio';
  return {
    id: launch.callId,
    conversationId: '',
    kind,
    status: 'ringing',
    caller: { id: LAUNCH_PREVIEW_CALLER_ID, name: launch.callerName, avatarUrl: launch.avatarUrl ?? null },
    callee: { id: selfId, name: '', avatarUrl: null },
    createdAt: new Date().toISOString(),
  };
}
