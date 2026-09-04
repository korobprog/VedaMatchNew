import { INGEST_MAX_ATTEMPTS } from './ingest-state';

/**
 * Мелкие правила стадии приёма, которые незачем проверять базой.
 *
 * Тем же приёмом, что `ingest-state.ts`: сервис ходит в S3 и Prisma, а
 * решения «какой это тип» и «повторять ли попытку» — чистые, и ошибка в них
 * тихая. Тип по расширению ключа тем более: у позиции своего `mime` нет, и
 * если угадать его неверно, разбор тегов молча вернёт пустоту, а запись
 * уедет в каталог без длительности.
 */

/**
 * Сколько позиций берётся за один тик.
 *
 * Три — потому что дальше упирается канал: у `url` и `zip` это три
 * одновременных скачивания по 150 МБ, а очередь всё равно разбирается за
 * несколько тиков по пятнадцать секунд.
 */
export const INGEST_BATCH_SIZE = 3;

/** Причина отказа в колонке — строка, а не роман. */
const MAX_REASON_LENGTH = 200;

const MIME_BY_EXTENSION: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
};

/**
 * Тип записи по расширению ключа.
 *
 * У позиции нет своего `mime`: файл кладётся подписанным PUT, и заявленный
 * браузером тип живёт только в подписи. Зато расширение ключа выбирали мы
 * сами по этому же типу — обратный ход надёжнее, чем доверять имени файла.
 *
 * `null` — расширение чужое: разбирать такой объект нечем, и позиция честно
 * падает вместо того, чтобы завести в каталоге неиграющую запись.
 */
export function mimeFromStorageKey(
  key: string | null | undefined,
): string | null {
  if (!key) return null;
  const name = key.split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return null;
  return MIME_BY_EXTENSION[name.slice(dot + 1).toLowerCase()] ?? null;
}

export interface AttemptOutcome {
  status: 'waiting' | 'failed';
  failureReason: string | null;
}

/**
 * Что делать с позицией после неудачной попытки.
 *
 * Причина остаётся и у возвращённой в очередь: пока идут повторы, админу
 * важнее знать, обо что спотыкается позиция, чем видеть пустую клетку.
 * Сравнение «не меньше», а не «равно»: счётчик растёт и при возврате
 * зависших, и промахнуться мимо точного значения он вполне может.
 */
export function nextStateAfterFailure(
  attempts: number,
  reason: string,
): AttemptOutcome {
  const trimmed = (reason ?? '').trim().slice(0, MAX_REASON_LENGTH);
  return {
    status: attempts >= INGEST_MAX_ATTEMPTS ? 'failed' : 'waiting',
    failureReason: trimmed === '' ? null : trimmed,
  };
}
