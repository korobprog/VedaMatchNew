import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  buildStatusPosterArgs,
  ffmpegPath,
  parseFfmpegInfo,
  type StatusVideoInfo,
} from './chat-status-video';

/** Ширина обложки — как у картинок переписки. */
const POSTER_WIDTH = 1600;
const POSTER_QUALITY = 80;
/** Разбор не должен висеть вечно на битом файле. */
const FFMPEG_TIMEOUT_MS = 60_000;

/**
 * Обёртка над ffmpeg для статусов (VED-129): снять обложку и замерить
 * ролик. Копия `blog/blog-video.service.ts` — по контракту модулей.
 *
 * Замеряет сервер, а не браузер: присланной клиентом длительности верить
 * нельзя — по ней проверяется предел, а подмена числа в запросе стоит одну
 * строку в консоли.
 *
 * Тестами не покрыта намеренно: здесь только временные файлы и `spawn`, а
 * всё решаемое вынесено в `chat-status-video.ts`.
 */
@Injectable()
export class ChatStatusVideoService {
  private readonly logger = new Logger(ChatStatusVideoService.name);

  /** `null` — ролик не разобрался; вызывающий отвечает отказом. */
  async inspect(
    video: Buffer,
    extension: string,
  ): Promise<{ info: StatusVideoInfo; poster: Buffer } | null> {
    const dir = await mkdtemp(join(tmpdir(), 'vm-status-'));
    const videoPath = join(dir, `source${extension}`);
    const posterPath = join(dir, 'poster.png');

    try {
      await writeFile(videoPath, video);
      const stderr = await this.run(
        ffmpegPath(),
        buildStatusPosterArgs({ videoPath, posterPath }),
      );
      const info = parseFfmpegInfo(stderr);
      const poster = await sharp(await readFile(posterPath))
        .resize({ width: POSTER_WIDTH, withoutEnlargement: true })
        .webp({ quality: POSTER_QUALITY })
        .toBuffer();
      return { info, poster };
    } catch (error) {
      this.logger.warn(
        `Ролик статуса не разобран: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    } finally {
      // Временную папку убираем всегда: иначе каждый неудачный разбор
      // оставляет десятки мегабайт на диске контейнера.
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /**
   * Возвращает начало stderr: сведения о входе ffmpeg печатает первыми, а
   * дальше идёт поток прогресса, который не нужен.
   */
  private run(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { windowsHide: true });
      let head = '';
      let tail = '';
      const timer = setTimeout(() => child.kill('SIGKILL'), FFMPEG_TIMEOUT_MS);
      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        if (head.length < 16_000) head += text;
        tail = (tail + text).slice(-400);
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(head);
        else reject(new Error(`${command} exited with ${code}: ${tail}`));
      });
    });
  }
}
