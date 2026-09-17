/**
 * Повтор отправки исходящего сигнала (VED-261, доработка по фидбеку
 * итерации 1, coordinator-note): сервер теперь честно отвечает 503, если
 * временный сбой Redis не позволил надёжно сохранить/пронумеровать сигнал
 * (`chat-calls.service.ts` — Redis обязателен как единственный источник
 * правды, когда настроен, и не подменяется молча локальной картой). Раньше
 * клиент на любую ошибку `POST /chat/calls/:id/signal` просто молчал,
 * полагаясь на то, что таймер обрыва/таймаут `connecting` в конце концов
 * решит проблему — теперь, когда сервер прямо говорит «повтори», отправитель
 * обязан попробовать ещё раз сам, а не только ждать.
 *
 * Три попытки суммарно (одна сразу + две с паузой) — не бесконечно: ICE-
 * кандидат, который не доехал за секунду-другую, дальше устареет сам
 * (появятся новые кандидаты), а offer/answer всё равно подстрахован
 * таймаутом `connecting` (`call-connect-timeout.ts`) и дочитыванием через
 * `GET /chat/calls/:id/signals` при следующем переподключении потока.
 */

export const SIGNAL_SEND_RETRY_DELAYS_MS: readonly number[] = [300, 900];

/**
 * Выполняет `send()`; при ошибке ждёт `delays[i]` и пробует снова, пока
 * попытки не кончатся. Не бросает — возвращает `true`, если получилось хоть
 * с какой-то попытки, иначе `false`: вызывающий код решает сам, стоит ли
 * что-то логировать, не оборачивая каждый вызов в свой try/catch.
 */
export async function sendWithRetry(
  send: () => Promise<void>,
  delays: readonly number[] = SIGNAL_SEND_RETRY_DELAYS_MS,
  wait: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<boolean> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await send();
      return true;
    } catch {
      if (attempt >= delays.length) return false;
      await wait(delays[attempt]);
    }
  }
}
