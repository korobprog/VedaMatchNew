import { PayloadTooLargeException } from '@nestjs/common';
import { Readable } from 'node:stream';
import type { Request } from 'express';
import { BlogUploadBudget, BlogUploadStorage } from './blog-upload-storage';

function handle(
  storage: BlogUploadStorage,
  req: object,
  chunks: Buffer[],
): Promise<{ error: Error | null; size?: number; buffer?: Buffer }> {
  return new Promise((resolve) => {
    storage._handleFile(
      req as Request,
      { stream: Readable.from(chunks) },
      (error, info) =>
        resolve({ error, size: info?.size, buffer: info?.buffer }),
    );
  });
}

describe('BlogUploadBudget', () => {
  it('allows up to the limit inclusive', () => {
    const budget = new BlogUploadBudget(10);
    expect(budget.take(6)).toBe(true);
    expect(budget.take(4)).toBe(true);
    expect(budget.take(1)).toBe(false);
  });
});

describe('BlogUploadStorage', () => {
  it('keeps the file in memory like memoryStorage', async () => {
    const storage = new BlogUploadStorage(100);
    const result = await handle(storage, {}, [
      Buffer.from('abc'),
      Buffer.from('de'),
    ]);
    expect(result.error).toBeNull();
    expect(result.size).toBe(5);
    expect(result.buffer?.toString()).toBe('abcde');
  });

  // Потолок — на запрос, а не на файл: три файла по 40 байт при потолке 100.
  it('cuts the request once all its files together cross the limit', async () => {
    const storage = new BlogUploadStorage(100);
    const req = {};
    expect((await handle(storage, req, [Buffer.alloc(40)])).error).toBeNull();
    expect((await handle(storage, req, [Buffer.alloc(40)])).error).toBeNull();
    const third = await handle(storage, req, [Buffer.alloc(40)]);
    expect(third.error).toBeInstanceOf(PayloadTooLargeException);
    expect(third.error?.message).toBe('upload_too_large');
  });

  it('counts every request on its own', async () => {
    const storage = new BlogUploadStorage(50);
    expect((await handle(storage, {}, [Buffer.alloc(40)])).error).toBeNull();
    expect((await handle(storage, {}, [Buffer.alloc(40)])).error).toBeNull();
  });
});
