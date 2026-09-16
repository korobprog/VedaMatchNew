import type { CallPhase } from './call-machine';
import type { NetworkTransport } from '../../../modules/vedamatch-calls';

/**
 * Перезапуск ICE при смене сети (VED-222, п.6) — «немедленно, а не по
 * таймауту обрыва»: `webrtc-session.ts` уже перезапускает ICE, когда
 * `RTCPeerConnection` сам сообщает `failed` (после ~секунд деградации), а
 * этот модуль решает, когда сделать то же самое ПРОАКТИВНО, как только
 * сменился основной транспорт сети (Wi-Fi ↔ LTE), не дожидаясь, пока старые
 * кандидаты вообще перестанут отвечать.
 *
 * Асимметрия роли — намеренная и совпадает с уже существующей в
 * `webrtc-session.ts` (`restartIce()` там тоже действует только для
 * `role === 'caller'`, см. `onconnectionstatechange` case `'failed'`):
 * перезапуск ICE — это новый offer с `iceRestart: true`, а offer в этом
 * протоколе сигналинга (`call-machine.ts`, `chat-calls-client.ts`) всегда
 * делает звонивший, «принятой» (perfect negotiation) схемы нет. Смена сети
 * на стороне ВЫЗЫВАЕМОГО поэтому не запускает восстановление напрямую здесь
 * — её всё равно увидит вызывающий, когда её последствия дойдут до его
 * `RTCPeerConnection` (`disconnected`/`failed`, штатный путь с той же
 * задержкой `DISCONNECT_GRACE_MS`, что и раньше). Немедленный путь короче
 * ровно для звонящего — известное, осознанное ограничение (расширение
 * сигналинга под запрос «перезапусти ты» — вне этого мобильного worktree,
 * `packages/shared` через контракт правит другая сессия).
 */
export function shouldRestartIceOnNetworkChange(
  phase: CallPhase,
  role: 'caller' | 'callee',
  previous: NetworkTransport | null,
  next: NetworkTransport,
): boolean {
  if (phase !== 'active') return false;
  if (role !== 'caller') return false;
  if (next === 'none') return false;
  // Первое известное значение — это факт инициализации подписки, а не смена
  // сети: перезапускать ICE в начале разговора не за чем.
  if (previous === null) return false;
  return previous !== next;
}
