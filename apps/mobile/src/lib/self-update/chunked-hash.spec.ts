import { createHash } from 'node:crypto';
import { HashCancelledError, sha256InChunks } from './chunked-hash';

function pseudoRandomBytes(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length);
  let state = seed >>> 0;
  for (let i = 0; i < length; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out[i] = state >>> 24;
  }
  return out;
}

const nodeSha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const noYield = () => Promise.resolve();

/** «Файл» в памяти: считает, какие куски у него попросили. */
function memoryFile(bytes: Uint8Array) {
  const reads: [number, number][] = [];
  return {
    reads,
    readChunk: (offset: number, length: number) => {
      reads.push([offset, length]);
      return bytes.slice(offset, offset + length);
    },
  };
}

describe('sha256InChunks', () => {
  const file = pseudoRandomBytes(100_003, 11);
  const expected = nodeSha256(file);

  it.each([1, 63, 64, 65, 4096, 65_536, 100_003, 1_000_000])(
    'совпадает с node:crypto при куске %i байт',
    async (chunkSize) => {
      const { readChunk } = memoryFile(file);
      await expect(
        sha256InChunks({ totalBytes: file.length, readChunk, chunkSize, yieldToEventLoop: noYield }),
      ).resolves.toBe(expected);
    },
  );

  it('читает файл подряд кусками не больше chunkSize, без перекрытий и дыр', async () => {
    const { readChunk, reads } = memoryFile(file);
    await sha256InChunks({ totalBytes: file.length, readChunk, chunkSize: 30_000, yieldToEventLoop: noYield });
    expect(reads).toEqual([
      [0, 30_000],
      [30_000, 30_000],
      [60_000, 30_000],
      [90_000, 10_003],
    ]);
  });

  it('отдаёт прогресс от 0 до полного размера, монотонно', async () => {
    const { readChunk } = memoryFile(file);
    const progress: number[] = [];
    await sha256InChunks({
      totalBytes: file.length,
      readChunk,
      chunkSize: 40_000,
      onProgress: (done, total) => {
        expect(total).toBe(file.length);
        progress.push(done);
      },
      yieldToEventLoop: noYield,
    });
    expect(progress).toEqual([0, 40_000, 80_000, 100_003]);
  });

  it('уступает поток между кусками (но не после последнего)', async () => {
    const { readChunk } = memoryFile(file);
    const yieldSpy = jest.fn(() => Promise.resolve());
    await sha256InChunks({ totalBytes: file.length, readChunk, chunkSize: 25_000, yieldToEventLoop: yieldSpy });
    // 25k ×4 + хвост 3 байта = 5 кусков → 4 паузы между ними.
    expect(yieldSpy).toHaveBeenCalledTimes(4);
  });

  it('по умолчанию уступает макрозадачей — таймер успевает сработать посреди хеширования', async () => {
    const { readChunk } = memoryFile(file);
    let timerFired = false;
    setTimeout(() => {
      timerFired = true;
    }, 0);
    let firedBeforeLastChunk = false;
    await sha256InChunks({
      totalBytes: file.length,
      readChunk: (offset, length) => {
        if (offset + length === file.length) firedBeforeLastChunk = timerFired;
        return readChunk(offset, length);
      },
      chunkSize: 50_000,
    });
    expect(firedBeforeLastChunk).toBe(true);
  });

  it('отмена посреди файла прерывает чтение HashCancelledError', async () => {
    const { readChunk, reads } = memoryFile(file);
    let cancelled = false;
    const run = sha256InChunks({
      totalBytes: file.length,
      readChunk: (offset, length) => {
        if (offset >= 20_000) cancelled = true;
        return readChunk(offset, length);
      },
      chunkSize: 10_000,
      isCancelled: () => cancelled,
      yieldToEventLoop: noYield,
    });
    await expect(run).rejects.toBeInstanceOf(HashCancelledError);
    // Прочитаны куски 0, 10k, 20k — после этого чтение прекратилось.
    expect(reads).toHaveLength(3);
  });

  it('отмена после последнего куска тоже не отдаёт результат', async () => {
    const { readChunk } = memoryFile(file);
    let cancelled = false;
    const run = sha256InChunks({
      totalBytes: file.length,
      readChunk: (offset, length) => {
        cancelled = true;
        return readChunk(offset, length);
      },
      chunkSize: file.length,
      isCancelled: () => cancelled,
      yieldToEventLoop: noYield,
    });
    await expect(run).rejects.toBeInstanceOf(HashCancelledError);
  });

  it('файл короче заявленного — ошибка, а не хеш неполных данных', async () => {
    const { readChunk } = memoryFile(file.subarray(0, 50_000));
    await expect(
      sha256InChunks({ totalBytes: file.length, readChunk, chunkSize: 30_000, yieldToEventLoop: noYield }),
    ).rejects.toThrow('прочитано 20000 байт вместо 30000 на позиции 30000');
  });

  it('пустой файл — хеш пустой строки без единого чтения', async () => {
    const { readChunk, reads } = memoryFile(new Uint8Array(0));
    await expect(sha256InChunks({ totalBytes: 0, readChunk })).resolves.toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(reads).toHaveLength(0);
  });

  it('отвергает неверный размер файла и куска', async () => {
    const { readChunk } = memoryFile(file);
    await expect(sha256InChunks({ totalBytes: -1, readChunk })).rejects.toThrow('неверный размер файла');
    await expect(sha256InChunks({ totalBytes: 1.5, readChunk })).rejects.toThrow('неверный размер файла');
    await expect(sha256InChunks({ totalBytes: 10, readChunk, chunkSize: 0 })).rejects.toThrow('неверный размер куска');
  });

  it('асинхронный readChunk (как у запасного пути через base64) работает так же', async () => {
    const { readChunk } = memoryFile(file);
    await expect(
      sha256InChunks({
        totalBytes: file.length,
        readChunk: async (offset, length) => readChunk(offset, length),
        chunkSize: 7_777,
        yieldToEventLoop: noYield,
      }),
    ).resolves.toBe(expected);
  });
});
