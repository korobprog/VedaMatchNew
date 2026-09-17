/**
 * Сериализация исходящих сигналов одного звонка (VED-261, feedback-002,
 * non-blocking п.1, усиливающий блокирующий п.1) — перенос
 * `apps/web/src/components/chat/calls/call-signal-send-queue.ts`.
 *
 * До этой правки каждый `onSignal` (offer, answer, очередной ICE-кандидат,
 * offer перезапуска ICE) уходил в свой независимый `sendWithRetry(...)` без
 * общей очереди — при параллельных ретраях (до 900 мс паузы) порядок
 * доставки на сервер, а с ним и порядок выданных `seq`, не гарантированно
 * совпадал с порядком генерации на клиенте.
 *
 * `SignalSendQueue` — простая промис-цепочка: следующая задача стартует
 * только после того, как предыдущая полностью разрешится (успехом или
 * исчерпанием попыток `sendWithRetry`), независимо от результата. Один
 * экземпляр на сессию звонка (`call-provider.tsx`, пересоздаётся вместе с
 * `CallSession` в `createSession`).
 */
export class SignalSendQueue {
  private tail: Promise<void> = Promise.resolve();

  /** Поставить задачу в очередь; вернёт то же, что вернёт сама задача. */
  enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
