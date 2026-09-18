import { bytesToHex } from './binary-utils';
import { Sha256 } from './sha256';

/**
 * Потоковое хеширование файла по кускам (VED-176, итерация 2). Чистая логика:
 * откуда брать байты, решает вызывающий код (`apk-downloader.ts` читает диск
 * через `expo-file-system`), здесь — только цикл «прочитать кусок → скормить
 * хешеру → отдать прогресс → уступить поток интерфейсу → проверить отмену».
 * В тесте `readChunk` читает из массива в памяти, и результат сверяется с
 * `node:crypto` при любом размере куска.
 *
 * Пиковая память — один кусок (`chunkSize`) плюс 64 байта хвоста хешера,
 * независимо от размера файла.
 */

/** 1 МиБ: на A51 чтение и хеширование куска — десятки миллисекунд, интерфейс между ними отвечает. */
export const DEFAULT_HASH_CHUNK_BYTES = 1024 * 1024;

export class HashCancelledError extends Error {
  constructor() {
    super('Проверка файла отменена');
    this.name = 'HashCancelledError';
  }
}

export interface ChunkedHashOptions {
  /** Размер файла в байтах — сколько всего читать. */
  totalBytes: number;
  /** Читает ровно `length` байт с позиции `offset` (последний кусок может быть короче). */
  readChunk(offset: number, length: number): Promise<Uint8Array> | Uint8Array;
  chunkSize?: number;
  onProgress?(bytesHashed: number, totalBytes: number): void;
  /** Проверяется перед каждым куском — `true` прерывает цикл `HashCancelledError`. */
  isCancelled?(): boolean;
  /** Уступить поток между кусками; по умолчанию — макрозадача `setTimeout(0)`. */
  yieldToEventLoop?(): Promise<void>;
}

function defaultYield(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function sha256InChunks(options: ChunkedHashOptions): Promise<string> {
  const { totalBytes, readChunk, onProgress, isCancelled } = options;
  const chunkSize = options.chunkSize ?? DEFAULT_HASH_CHUNK_BYTES;
  const yieldToEventLoop = options.yieldToEventLoop ?? defaultYield;

  if (!Number.isInteger(totalBytes) || totalBytes < 0) {
    throw new Error(`sha256InChunks: неверный размер файла ${totalBytes}`);
  }
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error(`sha256InChunks: неверный размер куска ${chunkSize}`);
  }

  const hasher = new Sha256();
  let offset = 0;
  onProgress?.(0, totalBytes);

  while (offset < totalBytes) {
    if (isCancelled?.()) throw new HashCancelledError();
    const length = Math.min(chunkSize, totalBytes - offset);
    const chunk = await readChunk(offset, length);
    if (chunk.length !== length) {
      // Файл короче заявленного (обрезан, подменён во время проверки) —
      // молча хешировать то, что есть, нельзя: дайджест всё равно не сойдётся,
      // но честнее сразу сказать, что файл не тот.
      throw new Error(`sha256InChunks: прочитано ${chunk.length} байт вместо ${length} на позиции ${offset}`);
    }
    hasher.update(chunk);
    offset += length;
    onProgress?.(offset, totalBytes);
    if (offset < totalBytes) await yieldToEventLoop();
  }

  if (isCancelled?.()) throw new HashCancelledError();
  return bytesToHex(hasher.digest());
}
