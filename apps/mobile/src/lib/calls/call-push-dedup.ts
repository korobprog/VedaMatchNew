/**
 * Идемпотентность нативного звонка (VED-221): FCM не гарантирует доставку
 * ровно один раз — переустановка соединения, повтор с бэкенда после
 * временной ошибки. Правила из спеки:
 *  - повторный `call.incoming` с тем же `callId`, пока он ещё звонит, не
 *    поднимает второй системный вызов;
 *  - `call.ended` обрабатывается один раз — второй с тем же `callId` не
 *    должен, например, второй раз гасить уже погашенный рингтон или звать
 *    нативный модуль, у которого уже нет этого звонка.
 *
 * Чистая структура данных, без FCM/нативного модуля: и фоновый обработчик
 * (`index.js`), и передний план (`native-call-bridge.ts`) сверяются с одним
 * инстансом (`callLifecycleTracker`), иначе два независимых счётчика не
 * защитят друг друга.
 */

export type CallIncomingOutcome = 'ring' | 'duplicate';
export type CallEndedOutcome = 'end' | 'duplicate';

type RecordState = 'ringing' | 'ended';

interface Record_ {
  state: RecordState;
  at: number;
}

export class CallLifecycleTracker {
  private readonly records = new Map<string, Record_>();

  /** Сколько помнить звонок после последнего события — на случай, если тот
   *  же `callId` понадобится (сервер переиспользует id разве что в тестах,
   *  но не в проде), не даём карте расти вечно. */
  constructor(private readonly ttlMs = 5 * 60_000) {}

  /** Первый `call.incoming` этого id, пока он ещё звонит — «звонить»;
   *  повтор, пока состояние `ringing`, — «дубликат». Новый `call.incoming`
   *  после того, как звонок уже завершился (например, перезвонили), снова
   *  «звонить». */
  handleIncoming(callId: string, nowMs: number): CallIncomingOutcome {
    this.sweep(nowMs);
    const existing = this.records.get(callId);
    if (existing?.state === 'ringing') return 'duplicate';
    this.records.set(callId, { state: 'ringing', at: nowMs });
    return 'ring';
  }

  /** Уже показан ли нативный входящий для этого `callId` прямо сейчас —
   *  чтение без изменения записи (VED-222, BUG D:
   *  `incoming-call-presentation.ts` использует это как `nativeShownFor`,
   *  чтобы решить, показывать ли ЕЩЁ и свой баннер на переднем плане). */
  isRinging(callId: string, nowMs: number): boolean {
    this.sweep(nowMs);
    return this.records.get(callId)?.state === 'ringing';
  }

  /** Первый `call.ended` этого id — «погасить»; повтор — «дубликат». */
  handleEnded(callId: string, nowMs: number): CallEndedOutcome {
    this.sweep(nowMs);
    const existing = this.records.get(callId);
    if (existing?.state === 'ended') return 'duplicate';
    this.records.set(callId, { state: 'ended', at: nowMs });
    return 'end';
  }

  private sweep(nowMs: number): void {
    for (const [callId, record] of this.records) {
      if (nowMs - record.at > this.ttlMs) this.records.delete(callId);
    }
  }
}

/** Один общий трекер на процесс: фоновый обработчик и передний план должны
 *  видеть одни и те же записи. */
export const callLifecycleTracker = new CallLifecycleTracker();
