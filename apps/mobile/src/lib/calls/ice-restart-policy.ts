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
 *
 * **Дебаунс (исправление `feedback-001.md` этого этапа, non-blocking п.1).**
 * На границе покрытия транспорт может флаппать (Wi-Fi ↔ LTE туда-обратно за
 * секунды) — без дебаунса каждая смена давала бы новый `createOffer({iceRestart:true})`,
 * рискуя гонкой `setLocalDescription` с предыдущим ещё не отправленным
 * перезапуском. `ICE_RESTART_DEBOUNCE_MS` — минимальный интервал между
 * двумя ПРИНЯТЫМИ решениями «перезапустить»; сравнение `previous !== next`
 * само по себе НЕ защищает от флаппинга (wifi→cellular→wifi за 2 секунды —
 * это два разных, оба «настоящих» изменения транспорта). Второй, отдельный
 * уровень защиты — флаг «перезапуск уже идёт» внутри самой сессии
 * (`webrtc-session.ts#restartIce`), от параллельного вызова, а не от частого
 * по времени: они защищают от разных гонок и оба нужны.
 */
export const ICE_RESTART_DEBOUNCE_MS = 5000;

export function shouldRestartIceOnNetworkChange(
  phase: CallPhase,
  role: 'caller' | 'callee',
  previous: NetworkTransport | null,
  next: NetworkTransport,
  nowMs: number,
  lastRestartAtMs: number | null,
): boolean {
  if (phase !== 'active') return false;
  if (role !== 'caller') return false;
  if (next === 'none') return false;
  // Первое известное значение — это факт инициализации подписки, а не смена
  // сети: перезапускать ICE в начале разговора не за чем.
  if (previous === null) return false;
  if (previous === next) return false;
  if (lastRestartAtMs !== null && nowMs - lastRestartAtMs < ICE_RESTART_DEBOUNCE_MS) return false;
  return true;
}
