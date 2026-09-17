/**
 * Таймаут фазы «соединяемся» (VED-261) — перенос
 * `apps/web/src/components/chat/calls/call-connect-timeout.ts`.
 *
 * Факт с устройства, из-за которого появился этот модуль: звонок сайт →
 * телефон по медленной 4G-раздаче. Телефон нажал «Ответить», сервер
 * подтвердил принятие, телефон поднял `RTCPeerConnection` и ждал offer, но
 * поток телефона в этот момент не был подключён — offer ушёл в пустоту, а
 * звонок висел в «Соединение…» больше двух минут без таймаута.
 *
 * По истечении `CONNECTING_TIMEOUT_MS` `call-provider.tsx` один раз
 * дочитывает пропущенные сигналы (`chat-calls-client.ts#signals`). Если это
 * принесло что-то новое — решение `extend`: даём ещё один такой же
 * интервал, чтобы ICE успел договориться на только что применённом
 * offer/answer. Если новых сигналов не нашлось — `fail`: висеть дальше
 * бессмысленно, звонок явно потерян, а не просто медленный.
 */

export const CONNECTING_TIMEOUT_MS = 20_000;

export type ConnectingTimeoutDecision = 'ignore' | 'extend' | 'fail';

export interface ConnectingTimeoutInput {
  /** Фаза звонка в момент срабатывания таймера. */
  phase: string;
  /** Звонок, за которым таймер следит на самом деле (мог смениться). */
  timeoutCallId: string;
  /** Звонок, о котором сейчас думает состояние — `null`, если звонка нет. */
  currentCallId: string | null;
  /** Дочитывание сигналов принесло хоть один новый сигнал. */
  madeProgress: boolean;
  /** Продление уже было использовано один раз для этого звонка. */
  alreadyExtended: boolean;
}

export function decideConnectingTimeout(
  input: ConnectingTimeoutInput,
): ConnectingTimeoutDecision {
  if (input.phase !== 'connecting' || input.currentCallId !== input.timeoutCallId)
    return 'ignore';
  if (input.madeProgress && !input.alreadyExtended) return 'extend';
  return 'fail';
}
