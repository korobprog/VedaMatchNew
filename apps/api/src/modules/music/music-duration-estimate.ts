/**
 * Длительность записи, когда прочитано только начало файла.
 *
 * Мы читаем первый мегабайт объекта, а не весь файл: киртан на сорок минут
 * это 60–120 МБ, и тянуть их в память процесса ради тегов нельзя. Но
 * `music-metadata` считает длительность по тому, что ей дали: на префиксе
 * она возвращает длительность **префикса**, а не файла, и делает это молча.
 *
 * Поймано на настоящей записи: в базу ушло 24 секунды вместо 154. На
 * синтетическом файле меньше мегабайта ошибки не видно вовсе — он целиком
 * помещается в префикс, — поэтому тестами она и не ловилась.
 *
 * Здесь решается, чему верить.
 */

/** Сколько байт от начала объекта читает сервис. Должно совпадать с хранилищем. */
export const METADATA_PREFIX_BYTES = 1024 * 1024;

/**
 * Размер ID3v2-тега в начале файла, вместе с десятибайтовым заголовком.
 * `0` — тега нет.
 *
 * Вычитать его обязательно: у записи с вшитой обложкой тег занимает под
 * сотню килобайт, и без вычета оценка завышается на эту обложку.
 */
export function readId3v2Size(prefix: Uint8Array): number {
  if (prefix.length < 10) return 0;
  if (prefix[0] !== 0x49 || prefix[1] !== 0x44 || prefix[2] !== 0x33) return 0;

  // Размер записан четырьмя синхробезопасными байтами: старший бит каждого
  // всегда ноль, поэтому значащих бит семь, а не восемь.
  const size =
    ((prefix[6] & 0x7f) << 21) |
    ((prefix[7] & 0x7f) << 14) |
    ((prefix[8] & 0x7f) << 7) |
    (prefix[9] & 0x7f);

  return size > 0 ? size + 10 : 0;
}

/**
 * Длительность по объёму аудиоданных и битрейту. Для CBR это точное
 * значение, для VBR — среднее по файлу, то есть ровно то, что нужно
 * каталогу.
 */
export function estimateDurationSeconds(
  sizeBytes: number,
  bitrateKbps: number,
  tagBytes: number,
): number | null {
  const audioBytes = sizeBytes - Math.max(0, tagBytes);
  if (!Number.isFinite(audioBytes) || audioBytes <= 0) return null;
  if (!Number.isFinite(bitrateKbps) || bitrateKbps <= 0) return null;

  const seconds = Math.round((audioBytes * 8) / (bitrateKbps * 1000));
  // Ноль секунд — не длительность, а признак того, что считать было не из
  // чего: обрезанный объект или мусорный битрейт. Валидатор откажет честно.
  return seconds > 0 ? seconds : null;
}

export interface DurationInput {
  /** Что вернул разбор тегов. `null` — не прочиталось. */
  parsedSeconds: number | null;
  /** Битрейт из тегов, килобиты в секунду. */
  bitrateKbps: number | null;
  /** Фактический размер объекта в бакете. */
  sizeBytes: number;
  /** Размер ID3v2-тега, если он есть. */
  tagBytes: number;
  /** Сколько байт мы прочитали. */
  readBytes: number;
}

/**
 * Насколько разобранная длительность может расходиться с оценкой, чтобы ей
 * всё ещё верили. Двадцать процентов покрывают VBR и погрешность вычета
 * тега, но не покрывают шестикратный промах на префиксе.
 */
const TRUST_TOLERANCE = 0.2;

/**
 * Чему верить: разбору или оценке.
 *
 * Разбору верим, когда он видел файл целиком, либо когда его ответ сходится
 * с оценкой по размеру. Второе важно: у VBR-файла с заголовком Xing точная
 * длительность лежит в начале, и подменять её оценкой было бы шагом назад.
 *
 * Когда разбор явно посчитал только префикс, берём оценку. Когда и оценить
 * нечем — отдаём `null`: валидатор откажет с честным «не удалось прочитать
 * длительность», а не заведёт в каталоге вечно короткую запись.
 */
export function resolveDurationSeconds(input: DurationInput): number | null {
  const estimate =
    input.bitrateKbps === null
      ? null
      : estimateDurationSeconds(
          input.sizeBytes,
          input.bitrateKbps,
          input.tagBytes,
        );

  const parsed =
    input.parsedSeconds !== null && input.parsedSeconds > 0
      ? Math.round(input.parsedSeconds)
      : null;

  // Прочитали весь объект — разбор видел всё, спорить не о чем.
  if (input.readBytes >= input.sizeBytes) return parsed;

  if (parsed === null) return estimate;
  if (estimate === null) return null;

  const отклонение = Math.abs(parsed - estimate) / estimate;
  return отклонение <= TRUST_TOLERANCE ? parsed : estimate;
}
