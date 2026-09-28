import type { MusicUploadStateDto } from "@vedamatch/shared";

/**
 * Ожидание перекодирования FLAC, WAV и OGG (VED-244).
 *
 * Отдельным модулем, а не в форме: здесь решается, сколько ждать, как часто
 * спрашивать и что считать концом — и всё это проверяется тестом без
 * рендера и настоящих таймеров.
 */

/**
 * Раз в пять секунд: сорокаминутный киртан перекодируется за полминуты, и
 * чаще спрашивать незачем, а реже — человек дольше смотрит на «перекодируется…»
 * уже готовой записи. Лимит маршрута — 30 запросов в минуту.
 */
export const TRANSCODE_POLL_MS = 5_000;

/**
 * Сколько форма ждёт, прежде чем перестать спрашивать. Очередь из десятка
 * часовых программ разбирается минут за десять; дальше — «перекодируется,
 * запись появится в «Моих загрузках»», а не вечный опрос в открытой вкладке.
 */
export const TRANSCODE_WAIT_MS = 20 * 60 * 1000;

export interface WaitForTranscodeOptions {
  intervalMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Перестать спрашивать — форма размонтирована. */
  cancelled?: () => boolean;
}

/**
 * Спрашивает, пока загрузка не закончится. `null` — не дождались (время
 * вышло или форму закрыли); запись при этом не пропала, стадия её доделает.
 *
 * Сбой одного запроса — не конец: сеть на телефоне моргает, а перекодирование
 * на сервере от этого не останавливается.
 */
export async function waitForTranscode(
  uploadId: string,
  fetchState: (uploadId: string) => Promise<MusicUploadStateDto>,
  {
    intervalMs = TRANSCODE_POLL_MS,
    timeoutMs = TRANSCODE_WAIT_MS,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    cancelled = () => false,
  }: WaitForTranscodeOptions = {},
): Promise<MusicUploadStateDto | null> {
  for (let waited = 0; waited < timeoutMs; waited += intervalMs) {
    await sleep(intervalMs);
    if (cancelled()) return null;
    const state = await fetchState(uploadId).catch(() => null);
    if (state && (state.state === "completed" || state.state === "failed")) {
      return state;
    }
  }
  return null;
}
