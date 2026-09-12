/**
 * Две кнопки запуска над списком записей (VED-33).
 *
 * Просили ровно это: одна кнопка — случайный порядок, вторая
 * многофункциональная: «первое нажатие играть один трек, второе — играть всю
 * очередь треков в папке и на последнем треке остановиться».
 *
 * Логика вынесена сюда, потому что «какое нажатие какое по счёту» — это не
 * состояние кнопки, а вопрос к плееру: человек мог уйти на другой экран,
 * поставить паузу, включить что-то ещё. Держать счётчик внутри кнопки значит
 * врать при первом же возврате на экран.
 */

/** Что произойдёт по следующему нажатию. */
export type MusicPlayStep = 'single' | 'all';

/**
 * Одна запись играет сама по себе, если очередь плеера ровно из неё и состоит:
 * тогда следующее нажатие раскрывает список целиком. Во всех остальных
 * случаях — включая «играет что-то другое» и «ничего не играет» — нажатие
 * начинает с одной записи.
 */
export function nextPlayStep({
  firstTrackId,
  queue,
  currentId,
}: {
  firstTrackId: string;
  queue: readonly string[];
  currentId: string | null;
}): MusicPlayStep {
  const aloneNow =
    currentId === firstTrackId &&
    queue.length === 1 &&
    queue[0] === firstTrackId;
  return aloneNow ? 'all' : 'single';
}

/**
 * Подпись говорит про то, что случится, а не про то, что звучит: кнопка,
 * подписанная «Один трек» во время игры этого трека, читается как отметка
 * состояния, и по ней перестают нажимать.
 */
export function playStepLabel(step: MusicPlayStep): string {
  return step === 'single' ? 'Слушать один трек' : 'Слушать всё до конца';
}

/**
 * Какую запись включить в случайном порядке. Бросок отделён, чтобы тест не
 * зависел от удачи.
 */
export function randomTrackId(
  queue: readonly string[],
  roll: () => number = Math.random,
): string | null {
  if (queue.length === 0) return null;
  const at = Math.min(queue.length - 1, Math.floor(roll() * queue.length));
  return queue[at];
}
