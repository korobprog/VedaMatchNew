import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  buildPosterArgs,
  buildProbeArgs,
  ffmpegPath,
  ffprobePath,
  parseProbe,
  type ProbeResult,
} from './moments-video';

/**
 * Обёртка над ffmpeg: снять постер и замерить ролик.
 *
 * Замер делает сервер, а не браузер. Присланной клиентом длительности верить
 * нельзя — по ней считается полоска прогресса и проверяется лимит, а подмена
 * числа в запросе стоит одну строку в консоли.
 *
 * Тестами не покрыта намеренно: здесь только временные файлы и `spawn`, а всё
 * решаемое вынесено в `moments-video.ts`.
 */
@Injectable()
export class MomentsVideoService {
  private readonly logger = new Logger(MomentsVideoService.name);

  /** `null` — ролик не разобрался; вызывающий отвечает отказом. */
  async inspect(
    video: Buffer,
    extension: string,
  ): Promise<{ probe: ProbeResult; poster: Buffer } | null> {
    const dir = await mkdtemp(join(tmpdir(), 'vm-moment-'));
    const videoPath = join(dir, `source${extension}`);
    const posterPath = join(dir, 'poster.png');

    try {
      await writeFile(videoPath, video);
      const probe = parseProbe(await this.run(ffprobePath(), buildProbeArgs(videoPath)));
      await this.run(
        ffmpegPath(),
        buildPosterArgs({ videoPath, posterPath }),
      );
      // Ширина и качество те же, что у фотографии момента: постер живёт в
      // тех же кольцах и на том же экране.
      const poster = await sharp(await readFile(posterPath))
        .resize({ width: 1080, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();

      return { probe, poster };
    } catch (error) {
      this.logger.warn(
        `Ролик момента не разобран: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    } finally {
      // Временную папку убираем в любом случае: иначе каждый неудачный
      // разбор оставляет десятки мегабайт на диске контейнера.
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private run(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { windowsHide: true });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        // Держим только хвост: нужен финал, а не поток прогресса.
        stderr = (stderr + chunk.toString()).slice(-2000);
      });
      child.on('error', reject);
      child.on('close', (code) =>
        code === 0
          ? resolve(stdout)
          : reject(new Error(`${command} exited with ${code}: ${stderr.slice(-400)}`)),
      );
    });
  }
}
