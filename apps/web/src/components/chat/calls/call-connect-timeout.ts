/**
 * Таймаут фазы «соединяемся» (VED-261): звонок, застрявший в `connecting`
 * дольше 20 секунд, раньше висел неограниченно — именно так на телефоне
 * зависал звонок, потерявший offer (см. `docs/chat-calls-plan.md`).
 *
 * По истечении `CONNECTING_TIMEOUT_MS` `call-provider.tsx` один раз
 * дочитывает пропущенные сигналы (`getChatCallSignals`). Если это принесло
 * что-то новое — решение `extend`: соединению даём ещё один такой же
 * интервал, чтобы ICE успел договориться на только что применённом
 * offer/answer. Если новых сигналов не нашлось — `fail`: висеть дальше
 * бессмысленно, звонок явно потерян, а не просто медленный.
 */

export const CONNECTING_TIMEOUT_MS = 20_000;

export type ConnectingTimeoutDecision = "ignore" | "extend" | "fail";

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
  // Звонок сменился или фаза уже не «соединяемся» — таймер устарел, его
  // решение никого не касается (обычный эффект гонки между async и React).
  if (input.phase !== "connecting" || input.currentCallId !== input.timeoutCallId)
    return "ignore";
  if (input.madeProgress && !input.alreadyExtended) return "extend";
  return "fail";
}
