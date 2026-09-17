/**
 * Дедупликация сигналов звонка при досинхронизации (VED-261).
 *
 * `call.signal` в общем потоке несёт `seq` — растущий номер в очереди
 * получателя. Клиент помнит наибольший применённый `seq` и после обрыва
 * `/chat/stream` дочитывает `GET /chat/calls/:id/signals?after=<lastSeq>`
 * (`chat-calls-client.ts`, `getChatCallSignals`). Оба источника — сам поток
 * и дочитывание — обязаны применять сигналы ровно один раз и в одном
 * порядке; чистая функция ниже — единственное место, которое это решает,
 * и `call-provider.tsx` прогоняет через неё сигнал независимо от того,
 * откуда он пришёл.
 *
 * Сигналы без `seq` (старое событие, обратная совместимость на скользящем
 * деплое) применяются всегда — дедуп для них невозможен и не нужен: без
 * номера сервер и не смог бы отдать его повторно через `signals?after=`.
 */

export interface SignalSeqState {
  lastSeq: number;
}

export const INITIAL_SIGNAL_SEQ_STATE: SignalSeqState = { lastSeq: 0 };

export interface SignalAdmission {
  /** Применять ли сигнал сейчас. */
  admit: boolean;
  next: SignalSeqState;
}

export function admitCallSignal(
  state: SignalSeqState,
  seq: number | undefined,
): SignalAdmission {
  if (seq === undefined) return { admit: true, next: state };
  if (seq <= state.lastSeq) return { admit: false, next: state };
  return { admit: true, next: { lastSeq: seq } };
}

/** Фазы, в которых имеет смысл дочитывать сигналы: до `connecting`
 *  дозвон ещё не согласован (сигналить нечего), после `active` разговор
 *  уже идёт и новый offer/answer не ожидается (только ICE-рестарт, который
 *  снова проходит через `connecting`). */
export function shouldCatchUpCallSignals(phase: string): boolean {
  return phase === "connecting" || phase === "active";
}
