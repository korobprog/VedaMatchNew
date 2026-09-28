import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, open, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { PrismaService } from '../../prisma/prisma.service';
import { MusicMetadataReader } from './music-metadata-reader';
import { MusicStorageService } from './music-storage.service';
import { MusicUploadsService } from './music-uploads.service';
import {
  buildFfprobeArgs,
  buildTranscodeArgs,
  chooseTranscodeBitrateKbps,
  ffmpegPath,
  ffprobePath,
  parseFfprobeOutput,
  parseTranscodeRequest,
  sniffTranscodeSource,
  TRANSCODE_FFMPEG_TIMEOUT_MS,
  TRANSCODE_OUTPUT_EXTENSION,
  TRANSCODE_OUTPUT_MIME,
  TRANSCODE_STALE_MS,
  transcodeStatusAfterFailure,
} from './music-transcode';
import type { MusicUploadRejection } from './music-upload-validate';

/** Сколько байт исходника отдаём разбору тегов — как и при обычной заливке. */
const METADATA_PREFIX_BYTES = 1024 * 1024;

/** Отказ, который повтором не лечится: файл тот же — ответ тот же. */
class TranscodeRejection extends Error {
  constructor(
    readonly rejection: MusicUploadRejection,
    readonly reason: string = rejection,
  ) {
    super(reason);
  }
}

interface ClaimedUpload {
  id: string;
  uploaderId: string;
  storageKey: string;
  mime: string;
  checksum: string | null;
  rightsBasis: 'own_recording' | 'open_program' | 'freely_distributed';
  transcodeAttempts: number;
  transcodeRequest: unknown;
}

/**
 * Стадия перекодирования FLAC, WAV и OGG в m4a (VED-244).
 *
 * Устойчивость — по образцу `MotivationWorkerService`: клейм строки через
 * `updateMany` с проверкой статуса, счётчик попыток, возврат зависших по
 * `updatedAt`. Лиз в Redis держит `MusicWorkerService`: перекодирование
 * съедает ядро целиком, и два экземпляра API, взявшиеся за две записи
 * разом, отняли бы процессор у запросов.
 *
 * Тестами покрыт только чистый модуль `music-transcode.ts`: здесь временные
 * файлы, `spawn` и S3, а всё решаемое вынесено туда.
 *
 * Исходник после удачного перекодирования удаляется: каталог отдаёт только
 * m4a, а хранить рядом FLAC «на будущее» — это гигабайты в бакете, за
 * которые платим, ради качества, которого никто не услышит.
 */
@Injectable()
export class MusicTranscodeService {
  private readonly logger = new Logger(MusicTranscodeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MusicStorageService,
    private readonly metadata: MusicMetadataReader,
    private readonly uploads: MusicUploadsService,
  ) {}

  /**
   * Одна загрузка за заход: перекодирование занимает ядро на минуты, и
   * очередь из десятка файлов разумнее разбирать тиками, чем держать процесс
   * занятым полчаса без передышки.
   */
  async processOnce(): Promise<number> {
    const next = await this.prisma.musicUpload.findFirst({
      where: { status: 'transcode_queued' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!next) return 0;

    const upload = await this.claim(next.id);
    // Строку успел взять другой процесс — его работа, не наша.
    if (!upload) return 0;

    await this.process(upload);
    return 1;
  }

  /**
   * Возврат строк, брошенных упавшим процессом: `transcoding`, который не
   * менялся дольше честного захода. Попытка уже засчитана при клейме,
   * поэтому исчерпавшие их не возвращаются, а отказываются.
   */
  async reviveStale(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - TRANSCODE_STALE_MS);
    const stale = await this.prisma.musicUpload.findMany({
      where: { status: 'transcoding', updatedAt: { lt: cutoff } },
      select: { id: true, storageKey: true, transcodeAttempts: true },
      take: 20,
    });

    let revived = 0;
    for (const row of stale) {
      const next = transcodeStatusAfterFailure(row.transcodeAttempts);
      const moved = await this.prisma.musicUpload.updateMany({
        where: { id: row.id, status: 'transcoding', updatedAt: { lt: cutoff } },
        data:
          next === 'failed'
            ? { status: 'failed', failureReason: 'transcode_failed' }
            : { status: 'transcode_queued' },
      });
      if (moved.count === 0) continue;
      if (next === 'failed') await this.storage.remove(row.storageKey);
      revived += 1;
    }
    if (revived > 0) {
      this.logger.warn(`Возвращено зависших перекодирований: ${revived}`);
    }
    return revived;
  }

  private async claim(id: string): Promise<ClaimedUpload | null> {
    const claimed = await this.prisma.musicUpload.updateMany({
      where: { id, status: 'transcode_queued' },
      data: { status: 'transcoding', transcodeAttempts: { increment: 1 } },
    });
    if (claimed.count === 0) return null;
    return this.prisma.musicUpload.findUnique({
      where: { id },
      select: {
        id: true,
        uploaderId: true,
        storageKey: true,
        mime: true,
        checksum: true,
        rightsBasis: true,
        transcodeAttempts: true,
        transcodeRequest: true,
      },
    });
  }

  private async process(upload: ClaimedUpload): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), 'vm-music-'));
    const sourcePath = join(dir, 'source');
    const outputPath = join(dir, `out.${TRANSCODE_OUTPUT_EXTENSION}`);
    let outputKey: string | null = null;

    try {
      const stream = await this.storage.getStream(upload.storageKey);
      if (!stream) throw new TranscodeRejection('file_empty');
      // На диск, а не в память: исходник бывает гигабайтом.
      await pipeline(stream, createWriteStream(sourcePath));
      const sourceBytes = (await stat(sourcePath)).size;

      const prefix = await readHead(sourcePath, METADATA_PREFIX_BYTES);
      const source = sniffTranscodeSource(prefix);
      if (!source) throw new TranscodeRejection('mime_not_accepted');

      const probe = parseFfprobeOutput(
        (await run(ffprobePath(), buildFfprobeArgs(sourcePath))).stdout,
      );
      if (!probe.hasAudio) throw new TranscodeRejection('mime_not_accepted');
      if (probe.durationSeconds === null) {
        throw new TranscodeRejection('duration_unknown');
      }
      const limits = this.uploads.uploadLimits;
      // Длину проверяем до ffmpeg: незачем минуты перекодировать то, что
      // всё равно не пройдёт.
      if (probe.durationSeconds > limits.maxDurationSeconds) {
        throw new TranscodeRejection('duration_too_long');
      }
      const bitrateKbps = chooseTranscodeBitrateKbps(
        probe.durationSeconds,
        limits.maxBytes,
      );
      if (bitrateKbps === null) throw new TranscodeRejection('file_too_large');

      await run(
        ffmpegPath(),
        buildTranscodeArgs({
          inputPath: sourcePath,
          outputPath,
          bitrateKbps,
          sampleRate: probe.sampleRate,
          channels: probe.channels,
        }),
      );
      const outputBytes = (await stat(outputPath)).size;

      // Теги и обложку — из исходника: ffmpeg переносит название, но
      // картинку в m4a мы не кладём, её сервис хранит отдельным объектом.
      const raw = await this.metadata.read(prefix, source.mime, sourceBytes);

      outputKey = this.storage.buildKey(
        upload.uploaderId,
        TRANSCODE_OUTPUT_EXTENSION,
      );
      await this.storage.putStream(
        outputKey,
        createReadStream(outputPath),
        TRANSCODE_OUTPUT_MIME,
      );

      const result = await this.uploads.acceptObject({
        upload,
        storageKey: outputKey,
        mime: TRANSCODE_OUTPUT_MIME,
        sizeBytes: outputBytes,
        checksum: upload.checksum,
        raw,
        durationSeconds: probe.durationSeconds,
        bitrateKbps,
        request: parseTranscodeRequest(upload.transcodeRequest),
        transcoded: true,
      });
      if (!result.ok) {
        throw new TranscodeRejection(result.rejection, result.message);
      }

      // Запись заведена — исходник больше не нужен никому.
      await this.storage.remove(upload.storageKey);
      this.logger.log(
        `Перекодировано ${upload.id}: ${source.container} ${sourceBytes} Б → m4a ${bitrateKbps} kbps ${outputBytes} Б`,
      );
    } catch (error) {
      if (outputKey) await this.storage.remove(outputKey);
      await this.failAttempt(upload, error);
    } finally {
      // Временную папку убираем всегда: исходник на гигабайт, оставленный
      // каждой неудачей, кончит диск контейнера за вечер.
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /**
   * Неудача захода. Отказ по существу (не тот формат, слишком длинная,
   * дубль) — сразу окончательный, с причиной для человека. Сбой (S3, упавший
   * ffmpeg) — повтор, пока не кончились попытки.
   */
  private async failAttempt(
    upload: ClaimedUpload,
    error: unknown,
  ): Promise<void> {
    const permanent = error instanceof TranscodeRejection;
    const next = permanent
      ? 'failed'
      : transcodeStatusAfterFailure(upload.transcodeAttempts);
    const reason = permanent ? error.reason : 'transcode_failed';

    this.logger.warn(
      `Перекодирование ${upload.id} (попытка ${upload.transcodeAttempts}) не удалось: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );

    const moved = await this.prisma.musicUpload.updateMany({
      where: { id: upload.id, status: 'transcoding' },
      data:
        next === 'failed'
          ? { status: 'failed', failureReason: reason.slice(0, 200) }
          : { status: 'transcode_queued' },
    });
    // Исходник убираем только у окончательного отказа и только если строка
    // всё ещё наша: иначе её уже вернули в очередь, и файл нужен.
    if (moved.count > 0 && next === 'failed') {
      await this.storage.remove(upload.storageKey);
    }
  }
}

/** Начало файла — для распознавания формата и разбора тегов. */
async function readHead(path: string, bytes: number): Promise<Buffer> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/**
 * Запуск ffmpeg или ffprobe. stdout копится целиком (у ffprobe это
 * короткий JSON, ffmpeg туда не пишет), из stderr — только хвост для
 * причины в логе.
 */
function run(
  command: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(
      () => child.kill('SIGKILL'),
      TRANSCODE_FFMPEG_TIMEOUT_MS,
    );
    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length < 64_000) stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-400);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited with ${code}: ${stderr}`));
    });
  });
}
