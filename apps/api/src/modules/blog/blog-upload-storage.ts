import { PayloadTooLargeException } from '@nestjs/common';
import type { Request } from 'express';
import type { Readable } from 'node:stream';
import { BLOG_UPLOAD_MAX_TOTAL_BYTES } from '@vedamatch/shared';

/**
 * Хранилище multer для публикации и правки поста: файлы в память, как у
 * стандартного `memoryStorage`, но с общим потолком на запрос (VED-116).
 *
 * Зачем свой. С роликами предел одного файла вырос до 50 МБ, а multer умеет
 * ограничивать только каждый файл по отдельности и их число. Десять файлов
 * по пределу — полгигабайта в памяти процесса от одного запроса, ещё до того,
 * как сервис успел сказать «роликов больше одного нельзя». Общий счётчик
 * обрывает такой запрос на лету, как только сумма перевалила за потолок.
 */

/** То, что multer передаёт хранилищу про очередной файл. */
interface IncomingFile {
  stream: Readable;
}

type Done = (
  error: Error | null,
  info?: { buffer: Buffer; size: number },
) => void;

/**
 * Счётчик байт одного запроса. Отдельным классом, чтобы потолок проверялся
 * тестом без multer и без сети.
 */
export class BlogUploadBudget {
  private used = 0;

  constructor(private readonly limit: number = BLOG_UPLOAD_MAX_TOTAL_BYTES) {}

  /** `false` — с этим куском запрос вылезает за потолок. */
  take(bytes: number): boolean {
    this.used += bytes;
    return this.used <= this.limit;
  }
}

export class BlogUploadStorage {
  /** Счётчик на запрос: WeakMap не держит запрос в памяти после ответа. */
  private readonly budgets = new WeakMap<object, BlogUploadBudget>();

  constructor(private readonly limit: number = BLOG_UPLOAD_MAX_TOTAL_BYTES) {}

  _handleFile(req: Request, file: IncomingFile, done: Done): void {
    let budget = this.budgets.get(req);
    if (!budget) {
      budget = new BlogUploadBudget(this.limit);
      this.budgets.set(req, budget);
    }

    const chunks: Buffer[] = [];
    let size = 0;
    let finished = false;
    const finish = (
      error: Error | null,
      info?: { buffer: Buffer; size: number },
    ) => {
      if (finished) return;
      finished = true;
      done(error, info);
    };

    file.stream.on('data', (chunk: Buffer) => {
      if (finished) return;
      if (!budget.take(chunk.length)) {
        chunks.length = 0;
        // Остаток потока сливаем в никуда: busboy должен дочитать тело, иначе
        // соединение повиснет, а ответ клиенту так и не уйдёт.
        file.stream.resume();
        finish(new PayloadTooLargeException('upload_too_large'));
        return;
      }
      chunks.push(chunk);
      size += chunk.length;
    });
    file.stream.on('error', (error: Error) => finish(error));
    file.stream.on('end', () =>
      finish(null, { buffer: Buffer.concat(chunks, size), size }),
    );
  }

  _removeFile(
    _req: Request,
    file: { buffer?: Buffer },
    done: (error: Error | null) => void,
  ): void {
    delete file.buffer;
    done(null);
  }
}
